import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs";
import * as cdk from "aws-cdk-lib"
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from "constructs"

interface ProductsAppStackProps extends cdk.StackProps {
    eventsDdb: dynamodb.Table
}

export class ProductsAppStack extends cdk.Stack {
    readonly productsFetchHandler: lambdaNodeJS.NodejsFunction;
    readonly productsAdminHandler: lambdaNodeJS.NodejsFunction;
    readonly productsDdb : dynamodb.Table;

    constructor(scope: Construct, id: string, props: ProductsAppStackProps) {
        super(scope, id, props);

        this.productsDdb = new dynamodb.Table(this, 'ProductsDbd', {
            tableName: 'products',
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            partitionKey: {
                name: 'id',
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PROVISIONED,
            readCapacity: 1,
            writeCapacity: 1
        });

        //Products Layer
        const productsLayerArn = ssm.StringParameter.valueForStringParameter(this, 'ProductsLayerVersionArn');
        const productsLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'ProductsLayerVersionArn', productsLayerArn);
        
        //Products Events Layer
        const productsEventLayerArn = ssm.StringParameter.valueForStringParameter(this, 'ProductsEventsLayerVersionArn');
        const productsEventLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'ProductsEventsLayerVersionArn', productsEventLayerArn);
        
        const productsEventHandler = new lambdaNodeJS.NodejsFunction(this, 
            'ProductsEventsFunction', 
            {
                functionName: 'ProductsEventsFunction',
                entry: 'lambda/products/productsEventFunction.ts',
                handler: 'handler',
                memorySize: 128,
                timeout: cdk.Duration.seconds(2),
                bundling: {
                    minify: true,
                    sourceMap: false
                },
                environment: {
                    EVENTS_DDB: props.eventsDdb.tableName
                },
                layers: [productsEventLayer],
                tracing: lambda.Tracing.ACTIVE,
                insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0
            }
        );

        const productEventsPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["dynamodb:PutItem"],
            resources: [props.eventsDdb.tableArn],
            conditions: {
                ['ForAllValues:StringLike']: {
                    'dynamodb:LeadingKeys': ['#product_*']
                }
            }
        });
        productsEventHandler.addToRolePolicy(productEventsPolicy);

        this.productsFetchHandler = new lambdaNodeJS.NodejsFunction(this,
            'ProductsFetchFunction',
            {
                functionName: 'ProductsFetchFunction',
                entry: 'lambda/products/productsFetchFunction.ts',
                handler: 'handler',
                memorySize: 128,
                timeout: cdk.Duration.seconds(5),
                bundling: {
                    minify: true,
                    sourceMap: false
                },
                environment: {
                    PRODUCTS_DDB: this.productsDdb.tableName
                },
                layers: [productsLayer],
                tracing: lambda.Tracing.ACTIVE,
                insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0
            }
        );
        this.productsDdb.grantReadData(this.productsFetchHandler);

        this.productsAdminHandler = new lambdaNodeJS.NodejsFunction(this,
            'ProductsAdminFunction',
            {
                functionName: 'ProductsAdminFunction',
                entry: 'lambda/products/productsAdminFunction.ts',
                handler: 'handler',
                memorySize: 128,
                timeout: cdk.Duration.seconds(5),
                bundling: {
                    minify: true,
                    sourceMap: false
                },
                environment: {
                    PRODUCTS_DDB: this.productsDdb.tableName,
                    PRODUCTS_EVENTS_FUNCTION_NAME: productsEventHandler.functionName
                },
                layers: [productsLayer, productsEventLayer],
                tracing: lambda.Tracing.ACTIVE,
                insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0
            }
        );
        this.productsDdb.grantWriteData(this.productsAdminHandler);
        productsEventHandler.grantInvoke(this.productsAdminHandler);
    }
}