import { airportsProvider } from "./airports"
import { criticalInfrastructureProvider } from "./critical-infrastructure"
import { environmentalProvider } from "./environmental"
import { militaryProvider } from "./military"
import { natsProvider } from "./nats"
import { notamProvider } from "./notam"
import { policeProvider } from "./police"
import { powerProvider } from "./power"
import { prisonsProvider } from "./prisons"
import { utilitiesProvider } from "./utilities"
import { countryAirspaceProviders } from "./countries"

export const airspaceProviders = [
  natsProvider,
  notamProvider,
  criticalInfrastructureProvider,
  prisonsProvider,
  policeProvider,
  militaryProvider,
  airportsProvider,
  powerProvider,
  utilitiesProvider,
  environmentalProvider,
  ...countryAirspaceProviders,
] as const

export function providerById(id: string) {
  return airspaceProviders.find((provider) => provider.id === id)
}
