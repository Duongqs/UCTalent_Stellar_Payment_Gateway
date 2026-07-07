export declare class IpnController {
    handleIpn(body: {
        result?: string;
        checksum?: string;
    }): Promise<{
        message: string;
    }>;
}
