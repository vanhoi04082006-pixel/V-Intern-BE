import { Controller, HttpCode, Post, RawBodyRequest, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { GithubWebhookService } from './github-webhook.service';

@Controller('github')
export class GithubWebhookController {
  constructor(private readonly webhooks: GithubWebhookService) {}
  @Public()
  @Post('webhook')
  @HttpCode(200)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  receive(@Req() request: RawBodyRequest<Request>) {
    return this.webhooks.consume(request.rawBody, request.get('X-Hub-Signature-256'), request.get('X-GitHub-Delivery'), request.get('X-GitHub-Event'));
  }
}
