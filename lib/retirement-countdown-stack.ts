import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda-nodejs";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import * as path from "path";

export interface RetirementCountdownStackProps extends cdk.StackProps {
  /** ISO date (YYYY-MM-DD) of the last working day */
  retirementDate: string;
  /** SES-verified sender address */
  senderEmail: string;
  /** Recipient address (also needs SES verification if account is in sandbox) */
  recipientEmail: string;
  /** Bedrock model id used to generate the daily joke */
  bedrockModelId: string;
}

export class RetirementCountdownStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RetirementCountdownStackProps) {
    super(scope, id, props);

    // Stores recent jokes so Bedrock can be told what to avoid repeating
    const jokeHistoryTable = new dynamodb.Table(this, "JokeHistoryTable", {
      partitionKey: { name: "date", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const countdownFn = new lambda.NodejsFunction(this, "CountdownFunction", {
      entry: path.join(__dirname, "../lambda/handler.ts"),
      handler: "handler",
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: {
        RETIREMENT_DATE: props.retirementDate,
        SENDER_EMAIL: props.senderEmail,
        RECIPIENT_EMAIL: props.recipientEmail,
        BEDROCK_MODEL_ID: props.bedrockModelId,
        TABLE_NAME: jokeHistoryTable.tableName,
      },
    });

    jokeHistoryTable.grantReadWriteData(countdownFn);

    countdownFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/${props.bedrockModelId}`,
        ],
      })
    );

    countdownFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ses:SendEmail", "ses:SendRawEmail"],
        resources: [
          `arn:aws:ses:${this.region}:${this.account}:identity/${props.senderEmail}`,
        ],
      })
    );

    // Daily trigger — 07:00 UTC. Adjust manually across BST/GMT if exact
    // local time matters year-round; EventBridge cron does not shift for DST.
    const rule = new events.Rule(this, "DailyScheduleRule", {
      schedule: events.Schedule.cron({ minute: "0", hour: "7" }),
    });
    rule.addTarget(new targets.LambdaFunction(countdownFn));

    // Ops alerting — separate from the joke email, tells you if the pipe breaks
    const alertTopic = new sns.Topic(this, "OpsAlertTopic");
    alertTopic.addSubscription(
      new subscriptions.EmailSubscription(props.recipientEmail)
    );

    const errorAlarm = new cloudwatch.Alarm(this, "FunctionErrorAlarm", {
      metric: countdownFn.metricErrors({ period: Duration.days(1) }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    errorAlarm.addAlarmAction(new cwActions.SnsAction(alertTopic));

    new cdk.CfnOutput(this, "CountdownFunctionName", {
      value: countdownFn.functionName,
    });
  }
}
