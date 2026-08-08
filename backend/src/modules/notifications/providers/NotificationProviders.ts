/**
 * Future notification delivery providers — interfaces only.
 * No Firebase / APNs / SMTP / SMS implementations.
 */

export type PushPayload = {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
};

export interface PushProvider {
  send(payload: PushPayload): Promise<void>;
}

export interface EmailProvider {
  send(input: {
    userId: string;
    subject: string;
    body: string;
  }): Promise<void>;
}

export interface SmsProvider {
  send(input: { userId: string; body: string }): Promise<void>;
}

export class NoOpPushProvider implements PushProvider {
  async send(_payload: PushPayload): Promise<void> {
    // Provider not configured.
  }
}

export class NoOpEmailProvider implements EmailProvider {
  async send(): Promise<void> {
    // Provider not configured.
  }
}

export class NoOpSmsProvider implements SmsProvider {
  async send(): Promise<void> {
    // Provider not configured.
  }
}
