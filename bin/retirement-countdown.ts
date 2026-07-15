#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { RetirementCountdownStack } from "../lib/retirement-countdown-stack";

const app = new cdk.App();

function requireContext(key: string): string {
  const value = app.node.tryGetContext(key);
  if (!value) {
    throw new Error(
      `Missing required context value "${key}". Pass it with: npx cdk deploy -c ${key}=<value>`
    );
  }
  return value;
}

new RetirementCountdownStack(app, "RetirementCountdownStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  // ---- Configure your countdown here (pass via -c on the CLI) ----
  retirementDate: requireContext("retirementDate"),
  senderEmail: requireContext("senderEmail"),
  recipientEmail: requireContext("recipientEmail"),
  bedrockModelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
});
