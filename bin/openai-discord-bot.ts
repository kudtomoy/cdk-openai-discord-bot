#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { OpenaiDiscordBotStack } from '../lib/openai-discord-bot-stack'

const app = new cdk.App()
new OpenaiDiscordBotStack(app, 'OpenaiDiscordBotStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
})
