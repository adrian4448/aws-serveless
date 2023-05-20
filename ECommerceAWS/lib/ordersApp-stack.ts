import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSource from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';

interface OrdersAppStackProps extends cdk.StackProps {
    productsDdb: dynamodb.Table;
    eventsDdb: dynamodb.Table;
}

export class OrdersAppStack extends cdk.Stack {
    readonly ordersHandler: lambdaNodeJs.NodejsFunction;
    readonly orderEventsFetchHandler: lambdaNodeJs.NodejsFunction;
    
    constructor(scope: Construct, id: string, props: OrdersAppStackProps) {
        super(scope, id, props);

        const ordersDdb = new dynamodb.Table(this, 'orders', {
            tableName: 'orders',
            partitionKey: {
                name: 'pk',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'sk',
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PROVISIONED,
            readCapacity: 1,
            writeCapacity: 1
        });

        // Products Layer
        const productsLayerArn = ssm.StringParameter.valueForStringParameter(this, 'ProductsLayerVersionArn');
        const productsLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'ProductsLayerVersionArn', productsLayerArn);

        // Orders Layer
        const ordersLayerArn = ssm.StringParameter.valueForStringParameter(this, 'OrdersLayerVersionArn');
        const ordersLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'OrdersLayerVersionArn', ordersLayerArn);
    
        // Orders Api Layer
        const ordersApiLayerArn = ssm.StringParameter.valueForStringParameter(this, 'OrdersApiLayerVersionArn');
        const ordersApiLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'OrdersApiLayerVersionArn', ordersApiLayerArn);

        // Orders Events Layer
        const ordersEventsLayerArn = ssm.StringParameter.valueForStringParameter(this, 'OrdersEventsLayerVersionArn');
        const ordersEventsLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'OrdersEventsLayerVersionArn', ordersEventsLayerArn);

        // Orders Events Repository Layer
        const ordersEventsRepositoryLayerArn = ssm.StringParameter.valueForStringParameter(this, 'OrdersEventsRepositoryLayerVersionArn');
        const ordersEventsRepositoryLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'OrdersEventsRepositoryLayerVersionArn', ordersEventsRepositoryLayerArn);
        

        const ordersTopic = new sns.Topic(this, 'OrdersEventsTopic', {
            displayName: 'Order Events Topic',
            topicName: 'order-events'
        });

        this.ordersHandler = new lambdaNodeJs.NodejsFunction(this, 'OrdersFunction', {
            functionName: 'OrdersFunction',
            entry: 'lambda/orders/ordersFunction.ts',
            handler: 'handler',
            memorySize: 128,
            timeout: cdk.Duration.seconds(5),
            bundling: {
                minify: true
            },
            environment: {
                PRODUCTS_DDB: props.productsDdb.tableName,
                ORDERS_DDB: ordersDdb.tableName,
                ORDER_EVENTS_TOPIC_ARN: ordersTopic.topicArn
            },
            layers: [ordersLayer, productsLayer, ordersApiLayer, ordersEventsLayer],
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0
        });

        ordersDdb.grantReadWriteData(this.ordersHandler);
        props.productsDdb.grantReadData(this.ordersHandler);
        ordersTopic.grantPublish(this.ordersHandler);

        const orderEventsHandler = new lambdaNodeJs.NodejsFunction(this, 'OrderEventsFunction', {
            functionName: 'OrderEventsFunction',
            entry: 'lambda/orders/orderEventsFunction.ts',
            handler: 'handler',
            memorySize: 128,
            timeout: cdk.Duration.seconds(5),
            bundling: {
                minify: true
            },
            environment: {
                EVENTS_DDB: props.eventsDdb.tableName
            },
            layers: [ordersEventsLayer, ordersEventsRepositoryLayer],
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0
        });

        ordersTopic.addSubscription(new subs.LambdaSubscription(orderEventsHandler));

        const eventsDdbPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["dynamodb:PutItem"],
            resources: [props.eventsDdb.tableArn],
            conditions: {
                ['ForAllValues:StringLike']: {
                    'dynamodb:LeadingKeys': ['#order_*']
                }
            }
        });
        orderEventsHandler.addToRolePolicy(eventsDdbPolicy);

        const billingHandler = new lambdaNodeJs.NodejsFunction(this, 'BillingFunction', {
            functionName: 'BillingFunction',
            entry: 'lambda/orders/billingFunction.ts',
            handler: 'handler',
            memorySize: 128,
            timeout: cdk.Duration.seconds(5),
            bundling: {
                minify: true
            },
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0
        });

        ordersTopic.addSubscription(new subs.LambdaSubscription(billingHandler, {
            filterPolicy: {
                eventType: sns.SubscriptionFilter.stringFilter({
                    allowlist: ['ORDER_CREATED']
                })
            }
        }));

        const orderEventsDlq = new sqs.Queue(this, 'OrderEventsDQL', {
            queueName: 'order-events-dlq',
            retentionPeriod: cdk.Duration.days(10)
        });

        const orderEventsQueue = new sqs.Queue(this, 'OrderEventsQueue', {
            queueName: 'order-events',
            deadLetterQueue: {
                maxReceiveCount: 3,
                queue: orderEventsDlq
            }
        });
        ordersTopic.addSubscription(new subs.SqsSubscription(orderEventsQueue, {
            filterPolicy: {
                eventType: sns.SubscriptionFilter.stringFilter({
                    allowlist: ['ORDER_CREATED']
                })
            }
        }));
   
        const orderEmailsHandler = new lambdaNodeJs.NodejsFunction(this, 'OrderEmailsFunction', {
            functionName: 'OrderEmailsFunction',
            entry: 'lambda/orders/orderEmailsFunction.ts',
            handler: 'handler',
            memorySize: 128,
            timeout: cdk.Duration.seconds(5),
            bundling: {
                minify: true
            },
            layers: [ordersEventsLayer],
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0
        });

        orderEmailsHandler.addEventSource(new lambdaEventSource.SqsEventSource(orderEventsQueue, {
            batchSize: 5,
            enabled: true,
            maxBatchingWindow: cdk.Duration.minutes(1)
        }));
        orderEventsQueue.grantConsumeMessages(orderEmailsHandler);

        const orderEmailSesPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['ses:SendEmail', 'ses:SendRawEmail'],
            resources: ['*']
        });
        orderEmailsHandler.addToRolePolicy(orderEmailSesPolicy);

        this.orderEventsFetchHandler = new lambdaNodeJs.NodejsFunction(this, 'OrderEventsFetchFunction', {
            functionName: 'OrderEventsFetchFunction',
            entry: 'lambda/orders/orderEventsFetchFunction.ts',
            handler: 'handler',
            memorySize: 128,
            timeout: cdk.Duration.seconds(5),
            bundling: {
                minify: true
            },
            environment: {
                EVENTS_DDB: props.eventsDdb.tableName
            },
            layers: [ordersEventsRepositoryLayer],
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0
        });
        const eventsFetchDdbPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['dynamodb:Query'],
            resources: [`${props.eventsDdb.tableArn}/index/emailIndex`]
        });
        this.orderEventsFetchHandler.addToRolePolicy(eventsFetchDdbPolicy)
    }
}