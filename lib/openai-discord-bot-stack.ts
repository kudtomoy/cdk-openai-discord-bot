import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import { readFileSync } from 'fs'

export class OpenaiDiscordBotStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const { accountId, region } = new cdk.ScopedAws(this)

    // Frugal VPC
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 1,
      natGateways: 1,
      natGatewayProvider: ec2.NatProvider.instance({
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T3,
          ec2.InstanceSize.NANO
        ),
      }),
    })

    // NAT Instance に Session Manager を使えるようにする
    const natInstance = vpc.node
      .findChild('PublicSubnet1')
      .node.findChild('NatInstance') as ec2.Instance
    natInstance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
    )

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
    })

    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    })

    // ECS Task から Parameter Store にアクセスできるようにする
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ssm:GetParameters'],
        resources: [
          `arn:aws:ssm:${region}:${accountId}:parameter/openai-discord-bot/discord-token`,
          `arn:aws:ssm:${region}:${accountId}:parameter/openai-discord-bot/openai-secret`,
        ],
      })
    )

    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      'TaskDefinition',
      {
        memoryLimitMiB: 512,
        cpu: 256,
        taskRole,
      }
    )

    taskDefinition.addContainer('ChatBotContainer', {
      image: ecs.ContainerImage.fromAsset('./containers/chatbot/'),
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'chatbot',
      }),
      environment: {
        CHARACTER_SETTING: readFileSync('./lib/character_setting.txt', 'utf8'),
      },
    })

    new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition,
    })
  }
}
