import { describe, expect, it } from 'vitest';
import { renderMissionProductTemplate } from './index.js';
describe('mission template resolution', () => {
    it('falls back to packaged templates when the repository template directory is missing', async () => {
        const rendered = await renderMissionProductTemplate({ key: 'spec', templatePath: 'stages/SPEC.md' }, {
            controlRoot: '/',
            branchRef: 'mission/17-reconstruct-agent-runtime-unification',
            brief: {
                title: 'Reconstruct agent runtime unification',
                body: 'Reconstruct agent runtime unification body',
                type: 'refactor'
            }
        });
        expect(rendered).toContain('Branch: mission/17-reconstruct-agent-runtime-unification');
        expect(rendered).toContain('## Architecture');
    });
});
