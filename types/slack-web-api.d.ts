declare module "@slack/web-api" {
  export class WebClient {
    constructor(token?: string);
    chat: {
      postMessage(
        args: { channel: string; text: string } & Record<string, any>,
      ): Promise<any>;
    };
  }
  export default WebClient;
}
