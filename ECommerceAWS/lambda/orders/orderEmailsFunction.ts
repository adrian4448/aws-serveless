import { Context, SNSMessage, SQSEvent } from "aws-lambda";
import { AWSError, SES } from "aws-sdk";
import { PromiseResult } from "aws-sdk/lib/request";
import * as AWSXRay from 'aws-xray-sdk';
import { Envelope, OrderEvent } from "/opt/nodejs/orderEventsLayer";

AWSXRay.captureAWS(require('aws-sdk'));

const sesClient = new SES();

export async function handler(event: SQSEvent, context: Context): Promise<void> {
    const promises: Promise<PromiseResult<SES.SendEmailResponse, AWSError>>[] = [];
    event.Records.forEach((record) => {
        console.log(record);
        const body = JSON.parse(record.body) as SNSMessage;
        promises.push(sendOrderEmail(body));
    });
    
    Promise.all(promises);

    return;
}

function sendOrderEmail(body: SNSMessage) {
    const envelope = JSON.parse(body.Message) as Envelope;
    const event = JSON.parse(envelope.data) as OrderEvent;

    return sesClient.sendEmail({
      Destination: {
        ToAddresses: [event.email]
      },
      Message: {
        Body: {
            Text: {
                Charset: 'utf-8',
                Data: `Recebemos seu pedido de numero: ${event.id} de valor ${event.billing}`
            }
        },
        Subject: {
            Charset: 'utf-8',
            Data: 'Recebemos seu pedido'
        }
      },
      Source: 'adrian.morais4448@gmail.com',
      ReplyToAddresses: ['adrian.morais4448@gmail.com']
    }).promise();
}