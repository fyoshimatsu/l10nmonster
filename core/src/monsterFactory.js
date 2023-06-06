import * as path from 'path';
import { statSync, mkdirSync } from 'fs';
import { MonsterManager, OpsMgr } from './core.js';

export async function createMonsterManager(configPath, options) {
    if (!configPath) {
        throw 'Cannot create l10n monster: missing configuration';
    }
    if (!l10nmonster.logger) {
        l10nmonster.logger = { verbose: () => false, info: () => false, warn: () => false, error: () => false };
    }
    if (!l10nmonster.env) {
        l10nmonster.env = {};
    }
    l10nmonster.baseDir = path.dirname(configPath);
    l10nmonster.regression = options.regression;
    l10nmonster.logger.verbose(`Requiring config: ${configPath}`);
    l10nmonster.prj = options.prj && options.prj.split(',');
    l10nmonster.arg = options.arg;
    const Config = require(configPath); // VS Code chokes on import() so we use require() until it grows up
    if (typeof Config !== 'function') {
        throw 'Invalid Config. Need to export a class constructor as a CJS module.exports';
    }
    l10nmonster.opsMgr = Config.opsDir ? new OpsMgr(path.join(l10nmonster.baseDir, Config.opsDir)) : new OpsMgr();

    try {
        const monsterConfig = new Config();
        const monsterDir = path.join(l10nmonster.baseDir, monsterConfig.monsterDir ?? '.l10nmonster');
        l10nmonster.logger.verbose(`Monster cache dir: ${monsterDir}`);
        mkdirSync(monsterDir, {recursive: true});
        const configSeal = statSync(configPath).mtime.toISOString();
        const mm = new MonsterManager({ monsterDir, monsterConfig, configSeal });
        for (const tp of Object.values(mm.translationProviders)) {
            typeof tp.translator.init === 'function' && await tp.translator.init(mm);
        }
        l10nmonster.logger.verbose(`L10n Monster factory-initialized!`);
        return mm;
    } catch(e) {
        throw `l10nmonster.cjs failed to construct: ${e.stack || e}`;
    }
}
