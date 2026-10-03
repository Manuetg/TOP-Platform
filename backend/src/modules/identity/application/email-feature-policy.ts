import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readDeploymentProfile, readEmailDeliveryMode } from '../../../config/environment';
import { EmailFeatureDisabledError } from '../domain/email-feature-disabled.error';

@Injectable()
export class EmailFeaturePolicy {
  private readonly disabled: boolean;

  constructor(config: ConfigService = new ConfigService()) {
    this.disabled = readDeploymentProfile(config) === 'lan-pilot';
    if (this.disabled) readEmailDeliveryMode(config);
  }

  assertAvailable(): void {
    if (this.disabled) throw new EmailFeatureDisabledError();
  }
}
