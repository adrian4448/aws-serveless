import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import * as apigatewayv2_integration from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import * as lambdaNodeJs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export class InvoiceWSApiStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: cdk.StackProps) {
        super(scope, id, props);

        // Invoice Transaction layer
        const invoiceTransactionLayerArn = ssm.StringParameter.valueForStringParameter(this, 'OrdersApiLayerVersionArn');
        const invoiceTransactionLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'OrdersApiLayer', invoiceTransactionLayerArn);

        // Invoice layer
        const invoiceLayerArn = ssm.StringParameter.valueForStringParameter(this, 'InvoiceRepositoryLayerArn');
        const invoiceLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'InvoiceRepository', invoiceLayerArn);

        // Invoice Websocket API Layer
        const invoiceWSConnectionLayerArn = ssm.StringParameter.valueForStringParameter(this, 'InvoiceWSConnectionLayerArn');
        const invoiceWSConnectionLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'InvoiceWSConnection', invoiceWSConnectionLayerArn);

        // Invoice and invoice transtacion DDB
        const invoicesDdb = new dynamodb.Table(this, 'InvoicesDdb', {
            tableName: 'invoices',
            billingMode: dynamodb.BillingMode.PROVISIONED,
            readCapacity: 1,
            writeCapacity: 1,
            partitionKey: {
                name: 'pk',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'sk',
                type: dynamodb.AttributeType.STRING
            },
            timeToLiveAttribute: 'ttl',
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });

        // Invoice Bucket s3
        const bucket = new s3.Bucket(this, 'InvoiceBucket', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            lifecycleRules: [
                {
                    enabled: true,
                    expiration: cdk.Duration.days(1)
                }
            ]
        });

        // Websocket connection handler (Connect)
        const connectionHandler = new lambdaNodeJs.NodejsFunction(this, 'InvoiceConnectionFunction', {
            functionName: 'InvoiceConnectionFunction',
            entry: 'lambda/invoices/invoiceConnectionFunction.ts',
            handler: 'handler',
            memorySize: 128,
            timeout: cdk.Duration.seconds(5),
            bundling: {
                minify: true
            },
            tracing: lambda.Tracing.ACTIVE
        });

        // Websocket disconnection handler (Disconnect)
        const disconnectionHandler = new lambdaNodeJs.NodejsFunction(this, 'InvoiceDisconnectionFunction', {
            functionName: 'InvoiceDisconnectionFunction',
            entry: 'lambda/invoices/invoiceDisconnectionFunction.ts',
            handler: 'handler',
            memorySize: 128,
            timeout: cdk.Duration.seconds(5),
            bundling: {
                minify: true
            },
            tracing: lambda.Tracing.ACTIVE
        });

        // Websocket API
        const websocketApi = new apigatewayv2.WebSocketApi(this, 'InvoiceWSApi', {
            apiName: 'InvoiceWSApi',
            connectRouteOptions: {
                integration: 
                    new apigatewayv2_integration.WebSocketLambdaIntegration('ConnectionHandler', connectionHandler)
            },
            disconnectRouteOptions: {
                integration: 
                    new apigatewayv2_integration.WebSocketLambdaIntegration('DisconnectionHandler', disconnectionHandler)
            }
        });

        const stage = 'prod';
        const wsApiEndpoint = `${websocketApi.apiEndpoint}/${stage}`;
        new apigatewayv2.WebSocketStage(this, 'InvoiceWSApiStage', {
            webSocketApi: websocketApi,
            stageName: stage,
            autoDeploy: true
        });

        // Invoice URL Handler
        const getUrlHandler = new lambdaNodeJs.NodejsFunction(this, 'InvoiceGetUrlFunction', {
            functionName: 'InvoiceGetUrlFunction',
            entry: 'lambda/invoices/invoiceGetUrlFunction.ts',
            handler: 'handler',
            memorySize: 128,
            timeout: cdk.Duration.seconds(5),
            bundling: {
                minify: true
            },
            layers: [invoiceTransactionLayer, invoiceWSConnectionLayer],
            tracing: lambda.Tracing.ACTIVE,
            environment: {
                INVOICE_DDB: invoicesDdb.tableName,
                BUCKET_NAME: bucket.bucketName,
                INVOICE_WSAPI_ENDPOINT: wsApiEndpoint
            }
        });

        const invoicesDdbWriteTransactionPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['dynamodb:PutItem'],
            resources: [invoicesDdb.tableArn],
            conditions: {
                ['ForAllValues:StringLike']: {
                    'dynamodb:LeadingKeys': ['#transaction']
                }
            }
        });

        getUrlHandler.addToRolePolicy(invoicesDdbWriteTransactionPolicy);
        
        const invoicesBucketPutObjectPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['s3:PutObject'],
            resources: [`${bucket.bucketArn}/*`]
        });
        getUrlHandler.addToRolePolicy(invoicesBucketPutObjectPolicy);
        websocketApi.grantManageConnections(getUrlHandler);
        
        // Invoice import handler
        const invoiceImportHandler = new lambdaNodeJs.NodejsFunction(this, 'InvoiceImportFunction', {
            functionName: 'InvoiceImportFunction',
            entry: 'lambda/invoices/invoiceImportFunction.ts',
            handler: 'handler',
            memorySize: 128,
            timeout: cdk.Duration.seconds(5),
            bundling: {
                minify: true
            },
            layers: [invoiceLayer, invoiceTransactionLayer, invoiceWSConnectionLayer],
            tracing: lambda.Tracing.ACTIVE,
            environment: {
                INVOICE_DDB: invoicesDdb.tableName,
                INVOICE_WSAPI_ENDPOINT: wsApiEndpoint
            }
        });
        invoicesDdb.grantReadWriteData(invoiceImportHandler);
        
        bucket.addEventNotification(s3.EventType.OBJECT_CREATED_PUT,
            new s3n.LambdaDestination(invoiceImportHandler));
        
        const invoicesBucketGetDeleteObjectPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['s3:DeleteObject','s3:getObject'],
            resources: [`${bucket.bucketArn}/*`]
        });
        invoiceImportHandler.addToRolePolicy(invoicesBucketGetDeleteObjectPolicy);
        websocketApi.grantManageConnections(invoiceImportHandler);
        
        // Cancel import handler
        const cancelImportHandler = new lambdaNodeJs.NodejsFunction(this, 'CancelImportFunction', {
            functionName: 'CancelImportFunction',
            entry: 'lambda/invoices/cancelImportFunction.ts',
            handler: 'handler',
            memorySize: 128,
            timeout: cdk.Duration.seconds(5),
            bundling: {
                minify: true
            },
            layers: [invoiceTransactionLayer, invoiceWSConnectionLayer],
            tracing: lambda.Tracing.ACTIVE,
            environment: {
                INVOICE_DDB: invoicesDdb.tableName,
                INVOICE_WSAPI_ENDPOINT: wsApiEndpoint
            }
        });

        const invoicesDdbReadWriteTransactionPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['dynamodb:UpdateItem', 'dynamodb:GetItem'],
            resources: [invoicesDdb.tableArn],
            conditions: {
                ['ForAllValues:StringLike']: {
                    'dynamodb:LeadingKeys': ['#transaction']
                }
            }
        });
        cancelImportHandler.addToRolePolicy(invoicesDdbReadWriteTransactionPolicy);
        websocketApi.grantManageConnections(cancelImportHandler);

        // Websocket API routes
        websocketApi.addRoute('getImportUrl', {
            integration: new apigatewayv2_integration.WebSocketLambdaIntegration('GetUrlHandler', getUrlHandler)
        });

        websocketApi.addRoute('cancelImport', {
            integration: new apigatewayv2_integration.WebSocketLambdaIntegration('CancelImportHandler', cancelImportHandler)
        });
    }
}