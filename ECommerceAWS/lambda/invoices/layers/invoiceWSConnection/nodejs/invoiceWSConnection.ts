import { ApiGatewayManagementApi } from "aws-sdk";

export class InvoiceWSService {
    private apiwManagamentApi: ApiGatewayManagementApi;

    constructor(apiwManagamentApi: ApiGatewayManagementApi) {
        this.apiwManagamentApi = apiwManagamentApi;
    }

    async disconnectClient(connectionId: string): Promise<boolean> {
        try {
            await this.apiwManagamentApi.getConnection({
                ConnectionId: connectionId
            }).promise();

            await this.apiwManagamentApi.deleteConnection({
                ConnectionId: connectionId
            });
            
            return true;
        } catch (err) {
            console.error(err);
            return false
        }
    }

    async sendInvoiceStatus(transactionId: string, connectionId: string, status: string) {
        const postData = JSON.stringify({
            transactionId: transactionId,
            status: status
        });
        return this.sendData(connectionId, postData);
    }

    async sendData(connectionId: string, data: string): Promise<Boolean> {
        try {
            await this.apiwManagamentApi.getConnection({
                ConnectionId: connectionId
            }).promise();

            await this.apiwManagamentApi.postToConnection({
                ConnectionId: connectionId,
                Data: data
            }).promise();

            return true;
        } catch (err) {
            console.error(err);
            return false
        }
    }
}