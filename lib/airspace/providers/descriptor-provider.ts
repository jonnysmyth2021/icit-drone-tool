import type { AirspaceProvider, AirspaceProviderDescriptor } from "../types"

/** Metadata-only provider used until a provider-specific importer is configured. */
export class DescriptorProvider implements AirspaceProvider {
  readonly id: string
  readonly country: string
  readonly authority: string
  readonly capabilities: AirspaceProvider["capabilities"]

  constructor(private readonly descriptor: AirspaceProviderDescriptor) {
    this.id = descriptor.id
    this.country = descriptor.country
    this.authority = descriptor.authority
    this.capabilities = descriptor.capabilities as AirspaceProvider["capabilities"]
  }

  describe() {
    return this.descriptor
  }
}
