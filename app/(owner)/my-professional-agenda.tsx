import { AgendaScopeSwitch } from "../../src/components/domain/AgendaScopeSwitch";
import { ProfessionalAgenda } from "../../src/features/appointments/ProfessionalAgenda";

// The owner's own professional agenda (only reachable while "serve as a professional" is on).
export default function OwnerProfessionalAgendaScreen() {
  return <ProfessionalAgenda header={<AgendaScopeSwitch scope="mine" />} mode="owner" />;
}
