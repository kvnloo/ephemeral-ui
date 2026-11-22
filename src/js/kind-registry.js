import { KINDS_A } from "./kinds-a.js";
import { KINDS_B } from "./kinds-b.js";
import { KINDS_C } from "./kinds-c.js";
import { KINDS_3D } from "./kinds-3d.js";
import { KINDS_E } from "./kinds-e.js";
import { KINDS_P } from "./kinds-p.js";
import { KINDS_F } from "./kinds-f.js";
import { KINDS_T } from "./kinds-t.js";
import { KINDS_I } from "./kinds-i.js";
import { KINDS_OPS } from "./kinds-ops.js";
import { KINDS_FLEET } from "./kinds-fleet.js";
import { KINDS_INTEL } from "./kinds-intel.js";
import { KINDS_CUA } from "./kinds-cua.js";
import { KINDS_GEV } from "./kinds-gev.js";
import { KINDS_DOCK } from "./kinds-dock.js";

export const KINDS = { ...KINDS_A, ...KINDS_B, ...KINDS_3D, ...KINDS_C, ...KINDS_E, ...KINDS_P, ...KINDS_F, ...KINDS_T, ...KINDS_I, ...KINDS_OPS, ...KINDS_FLEET, ...KINDS_INTEL, ...KINDS_CUA, ...KINDS_GEV, ...KINDS_DOCK };

export const STUDIO = new Set([KINDS_3D, KINDS_C, KINDS_E, KINDS_P, KINDS_F].flatMap(Object.keys));
