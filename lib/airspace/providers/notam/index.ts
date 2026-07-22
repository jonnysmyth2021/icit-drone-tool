import { DescriptorProvider } from "../descriptor-provider"

export const notamProvider = new DescriptorProvider({
  id: "uk-notam",
  country: "GB",
  authority: "NATS Aeronautical Information Service",
  capabilities: ["temporary"],
  authoritative: true,
  notes: "Requires an authorised operational NOTAM feed; never infer safety-critical geometry from unverified text.",
})
