import { Context, S3Event, S3EventRecord } from 'aws-lambda'
import { ApiGatewayManagementApi, DynamoDB, S3 } from 'aws-sdk';
import * as AWSXRay from 'aws-xray-sdk'
import { InvoiceFile, InvoiceRepository } from '/opt/nodejs/invoiceRepository';
import { InvoiceTransactionRepository, InvoiceTransactionStatus } from '/opt/nodejs/invoiceTransaction';
import { InvoiceWSService } from '/opt/nodejs/invoiceWSConnection';

AWSXRay.captureAWS(require('aws-sdk'))

const invoicesDdb = process.env.INVOICE_DDB!;
const invoicesWsApiEndpoint = process.env.INVOICE_WSAPI_ENDPOINT!.substring(6);

const s3Client = new S3();
const dynamodbClient = new DynamoDB.DocumentClient();
const apigwManagementApi = new ApiGatewayManagementApi({ 
    endpoint: invoicesWsApiEndpoint
});

const invoiceTransactionRepository = new InvoiceTransactionRepository(dynamodbClient, invoicesDdb)
const invoiceWSService = new InvoiceWSService(apigwManagementApi);
const invoiceRepository = new InvoiceRepository(dynamodbClient, invoicesDdb);

export async function handler(event: S3Event, context: Context): Promise<void> {
    console.log(event)

    const promises: Promise<void>[] = []

    event.Records.forEach((record) => {
        promises.push(processRecord(record));
    });

    await Promise.all(promises);
    
    return
}

async function processRecord(record: S3EventRecord) {
    const key = record.s3.object.key;

    try {
        const invoiceTransaction = await invoiceTransactionRepository
            .getInvoiceTransaction(key);

        if (invoiceTransaction.transactionStatus === InvoiceTransactionStatus.GENERATED) {
            await Promise.all([
                invoiceWSService.sendInvoiceStatus(key, invoiceTransaction.connectionId, InvoiceTransactionStatus.RECEIVED),
                invoiceTransactionRepository.updateInvoiceTransaction(key, InvoiceTransactionStatus.RECEIVED)
            ]);

            const object = await s3Client.getObject({
                Key: key,
                Bucket: record.s3.bucket.name
            }).promise()

            const invoice = JSON.parse(object.Body!.toString('utf-8')) as InvoiceFile;
            console.log(invoice);

            const createInvoicePromise = invoiceRepository.create({
                pk: `#invoice_${invoice.customerName}`,
                sk: invoice.invoiceNumber,
                productId: invoice.productId,
                ttl: 0,
                totalValue: invoice.totalValue,
                quantity: invoice.quantity,
                transactionId: key,
                createdAt: Date.now()
            });

            const deleteObjectPromise = s3Client.deleteObject({
                Key: key,
                Bucket: record.s3.bucket.name
            }).promise();

            const updateInvoicePromise = invoiceTransactionRepository.updateInvoiceTransaction(key, InvoiceTransactionStatus.PROCESSED);

            const sendStatusPromise = invoiceWSService.sendInvoiceStatus(key, invoiceTransaction.connectionId, InvoiceTransactionStatus.PROCESSED)

            Promise.all([createInvoicePromise, deleteObjectPromise, updateInvoicePromise, sendStatusPromise]);

        } else {
            await invoiceWSService.sendInvoiceStatus(key, invoiceTransaction.connectionId,
                invoiceTransaction.transactionStatus);

            console.log('Non valida transaction status');
            return
        }
    } catch (error) {
        console.log((<Error>error).message);
    }
}