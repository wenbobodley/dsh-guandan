#!/usr/bin/env node
/**
 * 版本三位一体校验（发布前必跑）：
 *   package.json version  ==  最近的 git tag (vX.Y.Z)  ==  npm registry 已发布版本
 * 用法：
 *   node scripts/check-version.mjs          # 检查本地一致性（不查 npm）
 *   node scripts/check-version.mjs --npm    # 额外对比 npm registry
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function sh(cmd) {
  try { return execSync(cmd, { cwd: root, encoding: 'utf8' }).trim(); }
  catch { return null; }
}

const issues = [];
const pkgVer = pkg.version;

// 1) 最近的 git tag
const latestTag = sh('git describe --tags --abbrev=0 2>/dev/null');
if (!latestTag) {
  issues.push('❌ 无任何 git tag');
} else if (latestTag !== `v${pkgVer}`) {
  issues.push(`❌ git tag ${latestTag} ≠ package.json version ${pkgVer}`);
} else {
  console.log(`✅ git tag ${latestTag} == package.json ${pkgVer}`);
}

// 2) git 工作区是否干净（发布必须基于已提交状态）
const dirty = sh('git status --porcelain');
if (dirty) {
  issues.push(`⚠️ 工作区有未提交改动（${dirty.split('\n').length} 项）——发布前先 commit`);
} else {
  console.log('✅ 工作区干净');
}

// 3) npm registry 对比（可选）
if (process.argv.includes('--npm')) {
  const npmVer = sh(`npm view ${pkg.name} version 2>/dev/null`);
  if (!npmVer) {
    issues.push(`⚠️ npm 查不到 ${pkg.name}（可能未发布）`);
  } else if (npmVer !== pkgVer) {
    issues.push(`❌ npm 已发布 ${npmVer} ≠ 本地 ${pkgVer}——npm version 后再发布`);
  } else {
    console.log(`✅ npm registry ${npmVer} == 本地 ${pkgVer}`);
  }
}

if (issues.length) {
  console.error('\n=== 版本一致性检查未通过 ===');
  issues.forEach((i) => console.error(i));
  process.exit(1);
}
console.log('\n✅ 版本三位一体一致，可以发布');