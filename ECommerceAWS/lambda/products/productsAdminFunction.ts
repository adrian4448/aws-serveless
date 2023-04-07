import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDB } from "aws-sdk";
import { Context } from "vm";
import { Product, ProductRepository } from "/opt/nodejs/productsLayer";

const productsDdb = process.env.PRODUCTS_DDB!;
const ddbClient = new DynamoDB.DocumentClient();

const productRepository = new ProductRepository(ddbClient, productsDdb);

export async function handler(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult>{
    const lambdaRequestId = context.awsRequestId;
    const apiRequestRequestId = event.requestContext.requestId;
    
    console.log(`API Gateway RequestId: ${apiRequestRequestId} - Lambda RequestID: ${lambdaRequestId}`);

    const method = event.httpMethod;
    const resourceIsProducts = event.resource === '/products';
    const resourceIsProductsWithId = event.resource === '/products/{id}';

    if (resourceIsProducts) {
        const product = JSON.parse(event.body!) as Product 
        const productCreated = await productRepository.create(product);
        
        return {
            statusCode: 201,
            body: JSON.stringify(productCreated)
        };
    }else if (resourceIsProductsWithId) {
        const productId = event.pathParameters!.id as string; 
        console.log("Produto de ID:", productId);
        
        if (method === 'PUT') {
            try {
                const product = JSON.parse(event.body!) as Product
                const productUpdated = await productRepository.update(product, productId);
        
                return {
                    statusCode: 200,
                    body: JSON.stringify(productUpdated)
                };
            } catch (ConditionCheckFailedException) {
                return {
                    statusCode: 404,
                    body: 'ProductNotFound'
                };
            }
        }else {
            try {
                const productDeleted = await productRepository.delete(productId);

                return {
                    statusCode: 200,
                    body: JSON.stringify(productDeleted)
                };
            } catch (error) {
                console.log((<Error>error).message);
                return {
                    statusCode: 404,
                    body: (<Error>error).message
                };
            }
        }
    }

    return {
        statusCode: 400,
        body: JSON.stringify({ message: "BAD REQUEST" })
    };
}