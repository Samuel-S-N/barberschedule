import { AgendaScopeSwitch } from "../../src/components/domain/AgendaScopeSwitch";
import { BarberAgenda } from "../../src/features/appointments/BarberAgenda";

// The owner's own barber agenda (only reachable while "serve as a barber" is on).
export default function OwnerBarberAgendaScreen() {
  return <BarberAgenda header={<AgendaScopeSwitch scope="mine" />} mode="owner" />;
}
