// Orchestrates hydration of every clinic-config cache. Importing the modules
// below runs their registerHydrator() side-effects, so hydrateClinicConfig()
// (called once the active clinic is known — see AuthContext) pulls them all from
// Supabase. Kept in its own file so AuthContext has a single import and the
// modules are guaranteed to be registered before the first hydrate.
import "./services";
import "./promotions";
import "./breeds";
import "./meds";
import "./vaccines";
import "./locations";
import "./settings";

export { hydrateClinicConfig, hydratedFor } from "./clinicSync";
