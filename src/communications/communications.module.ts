import { Module } from '@nestjs/common';
import { CommunicationsController } from './communications.controller';
import { CommunicationsService } from './communications.service';
import { MailTransport } from './mail-transport';
@Module({ controllers: [CommunicationsController], providers: [CommunicationsService, MailTransport], exports: [CommunicationsService] })
export class CommunicationsModule {}
