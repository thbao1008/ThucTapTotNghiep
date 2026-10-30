import fs from 'node:fs';
import path from 'node:path';

// Resolve the same FFmpeg environment for every local speech worker, independent
// of the developer's folder name. Never mutate the caller's environment.
export function speechEnvironment(backendDir, {env=process.env, platform=process.platform}={}) {
  const result={...env}, pathKeys=Object.keys(result).filter(key=>key.toLowerCase()==='path');
  const inherited=pathKeys.length?result[pathKeys[0]]:'';
  const executable=platform==='win32'?'ffmpeg.exe':'ffmpeg';
  const candidates=env.FFMPEG_BIN?[path.resolve(env.FFMPEG_BIN)]:[];
  const projectRoot=path.resolve(backendDir,'..');
  try {for(const name of fs.readdirSync(projectRoot).sort().reverse())if(name.startsWith('ffmpeg-'))candidates.push(path.join(projectRoot,name,'bin'));}catch{/* PATH alone is supported. */}
  const directory=candidates.find(candidate=>fs.existsSync(path.join(candidate,executable)));
  if(directory){for(const key of pathKeys)delete result[key];result.PATH=[directory,inherited].filter(Boolean).join(platform==='win32'?';':':');}
  return result;
}
