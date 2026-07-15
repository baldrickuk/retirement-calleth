#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { RetirementCountdownStack } from "../lib/retirement-countdown-stack";

const app = new cdk.App();

new RetirementCountdownStack(app, "RetirementCountdownStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  // ---- Configure your countdown here ----
  retirementDate: "2028-04-01",
  senderEmail: "your-verified-sender@example.com",
  recipientEmail: "your-recipient@example.com",
  bedrockModelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
});
