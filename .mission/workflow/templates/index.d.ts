import type { MissionProductTemplate, MissionStageTemplateDefinitions, MissionTaskTemplateRef, MissionTaskTemplate, MissionTemplateContext, MissionTemplateContextInput } from './types.js';
export type { MissionProductTemplate, MissionStageTemplateDefinition, MissionStageTemplateDefinitions, MissionTemplateContext, MissionTemplateContextInput, MissionTaskTemplateRef, MissionTaskTemplate } from './types.js';
export declare function renderMissionBriefBody(input: MissionTemplateContextInput): Promise<string>;
export declare function renderMissionProductTemplate(template: MissionProductTemplate, input: MissionTemplateContextInput): Promise<string>;
export declare function renderMissionTaskTemplate(template: MissionTaskTemplateRef, input: MissionTemplateContextInput): Promise<MissionTaskTemplate>;
export declare function createMissionTemplateContext(input: MissionTemplateContextInput): MissionTemplateContext;
export declare const MISSION_STAGE_TEMPLATE_DEFINITIONS: MissionStageTemplateDefinitions;
//# sourceMappingURL=index.d.ts.map