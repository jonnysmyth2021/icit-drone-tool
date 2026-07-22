import { DescriptorProvider } from "../descriptor-provider"

export const criticalInfrastructureProvider = new DescriptorProvider({
  id: "critical-infrastructure",
  country: "GB",
  authority: "Configured authoritative asset custodians",
  capabilities: ["infrastructure"],
  authoritative: false,
  notes: "Provider registry for licensed infrastructure datasets; provenance is mandatory per feature.",
})
