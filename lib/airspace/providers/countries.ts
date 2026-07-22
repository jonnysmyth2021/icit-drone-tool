import { DescriptorProvider } from "./descriptor-provider"

export const countryAirspaceProviders = [
  new DescriptorProvider({ id: "ie-iaa", country: "IE", authority: "Irish Aviation Authority", capabilities: ["permanent", "temporary"], authoritative: true }),
  new DescriptorProvider({ id: "eu-ead", country: "EU", authority: "European AIS Database", capabilities: ["permanent", "temporary"], authoritative: true }),
  new DescriptorProvider({ id: "us-faa", country: "US", authority: "Federal Aviation Administration", capabilities: ["permanent", "temporary"], authoritative: true }),
  new DescriptorProvider({ id: "ca-nav-canada", country: "CA", authority: "NAV CANADA", capabilities: ["permanent", "temporary"], authoritative: true }),
] as const
