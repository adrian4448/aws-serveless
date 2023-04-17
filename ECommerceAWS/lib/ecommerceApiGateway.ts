import * as apiGateway from 'aws-cdk-lib/aws-apigateway';
import * as cdk from 'aws-cdk-lib';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs'
import * as cwlogs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs'

interface ECommerceApiStackProps extends cdk.StackProps {
    productsFetchHandler: lambdaNodeJS.NodejsFunction;
    productsAdminHandler: lambdaNodeJS.NodejsFunction;
    ordersHandler: lambdaNodeJS.NodejsFunction
}

export class ECommerceApiGatewayStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: ECommerceApiStackProps) {
        super(scope, id, props);

        const logGroup = new cwlogs.LogGroup(this, 'ECommerceApiLogs')
        const api = new apiGateway.RestApi(this, 'ECommerceApiGateway', {
            restApiName: 'ECommerceApiGateway',
            cloudWatchRole: true,
            deployOptions: {
                accessLogDestination: new apiGateway.LogGroupLogDestination(logGroup),
                accessLogFormat: apiGateway.AccessLogFormat.jsonWithStandardFields({
                    httpMethod: true,
                    ip: true,
                    protocol: true,
                    requestTime: true,
                    resourcePath: true,
                    responseLength: true,
                    status: true,
                    caller: true,
                    user: true
                })
            }
        });

        this.createProductsService(props, api);
        this.createOrdersService(props, api);
    }

    private createProductsService(props: ECommerceApiStackProps, api: apiGateway.RestApi) {
        const productsFetchIntegration = new apiGateway.LambdaIntegration(props.productsFetchHandler);

        // "GET /products"
        const productsResource = api.root.addResource('products');
        productsResource.addMethod('GET', productsFetchIntegration);

        // "GET /products/{id}"
        const productsIdResource = productsResource.addResource("{id}");
        productsIdResource.addMethod('GET', productsFetchIntegration);

        const productsAdminIntegration = new apiGateway.LambdaIntegration(props.productsAdminHandler);

        // "POST /products"
        const productsValidator = new apiGateway.RequestValidator(this, 'ProductsValidator', {
            restApi: api,
            requestValidatorName: 'ProductsValidator',
            validateRequestBody: true
        });
        
        const productsModel = new apiGateway.Model(this, 'ProductsModel', {
            restApi: api,
            modelName: 'ProductsModel',
            schema: {
                type: apiGateway.JsonSchemaType.OBJECT,
                properties: {
                    productName: {
                        type: apiGateway.JsonSchemaType.STRING
                    },
                    code: {
                        type: apiGateway.JsonSchemaType.STRING
                    },
                    price: {
                        type: apiGateway.JsonSchemaType.NUMBER
                    },
                    model: {
                        type: apiGateway.JsonSchemaType.STRING
                    },
                    productUrl: {
                        type: apiGateway.JsonSchemaType.STRING
                    }
                },
                required: ['productName', 'code']
            }
        });

        productsResource.addMethod('POST', productsAdminIntegration, {
            requestValidator: productsValidator,
            requestModels: {
                "application/json": productsModel
            }
        });

        // "DELETE, PUT /products/{id}"
        productsIdResource.addMethod('DELETE', productsAdminIntegration);
        
        productsIdResource.addMethod('PUT', productsAdminIntegration, {
            requestValidator: productsValidator,
            requestModels: {
                "application/json": productsModel
            }
        });
    }

    private createOrdersService(props: ECommerceApiStackProps, api: apiGateway.RestApi) {
        const ordersIntegration = new apiGateway.LambdaIntegration(props.ordersHandler);
        
        const ordersResource = api.root.addResource('orders');
        
        // GET /orders
        // GET /orders?email=teste
        // GET /orders?email=teste&orderId=123
        ordersResource.addMethod('GET', ordersIntegration);

        // DELETE /orders?email=teste&orderId=123
        const ordersDeletionValidator = new apiGateway.RequestValidator(this, 'OrdersDeletionValidator', {
            restApi: api,
            requestValidatorName: 'OrdersDeletionValidator',
            validateRequestParameters: true
        });

        ordersResource.addMethod('DELETE', ordersIntegration, {
            requestParameters: {
                'method.request.querystring.email': true,
                'method.request.querystring.orderId': true
            },
            requestValidator: ordersDeletionValidator
        });

        // POST /orders
        const orderRequestValidator = new apiGateway.RequestValidator(this, 'OrderRequestValidator', {
            restApi: api,
            requestValidatorName: 'OrderRequestValidator',
            validateRequestBody: true
        });

        const orderModel = new apiGateway.Model(this, 'OrderModel', {
            modelName: 'OrderModel',
            restApi: api,
            schema: {
                type: apiGateway.JsonSchemaType.OBJECT,
                properties: {
                    email: {
                        type: apiGateway.JsonSchemaType.STRING
                    },
                    productsId: {
                        type: apiGateway.JsonSchemaType.ARRAY,
                        minItems: 1,
                        items: {
                            type: apiGateway.JsonSchemaType.STRING
                        }
                    },
                    payment: {
                        type: apiGateway.JsonSchemaType.STRING,
                        enum: ['CASH', 'DEBIT_CARD', 'CREDIT_CARD']
                    }
                },
                required: ["email", "productsId", "payment"]
            }
        });

        ordersResource.addMethod('POST', ordersIntegration, {
            requestValidator: orderRequestValidator,
            requestModels: {
                "application/json": orderModel
            } 
        });
    }
}