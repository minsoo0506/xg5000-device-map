export function validateProject(project) {
  if (
    !project ||
    !Array.isArray(project.devices) ||
    !Array.isArray(project.rungs)
  )
    throw Error('devices와 rungs 배열이 필요합니다.');
  const addresses = new Set();
  for (const d of project.devices) {
    if (
      !d ||
      typeof d.address !== 'string' ||
      !d.address.trim() ||
      addresses.has(d.address)
    )
      throw Error('디바이스 주소가 비어 있거나 중복되었습니다.');
    addresses.add(d.address);
  }
  const ids = new Set();
  for (const r of project.rungs) {
    if (
      !r ||
      typeof r.id !== 'string' ||
      !r.id ||
      ids.has(r.id) ||
      typeof r.program !== 'string' ||
      typeof r.location !== 'string' ||
      !Array.isArray(r.reads) ||
      !Array.isArray(r.writes)
    )
      throw Error(
        '조건 묶음의 id, program, location, reads, writes를 확인하세요.',
      );
    ids.add(r.id);
    for (const address of [...r.reads, ...r.writes.map((w) => w?.address)])
      if (!addresses.has(address))
        throw Error(`정의되지 않은 디바이스: ${address}`);
    if (r.writes.some((w) => typeof w.instruction !== 'string'))
      throw Error('쓰기 명령이 필요합니다.');
  }
  return project;
}
// A project is replaced as a unit when another file opens. Its reference index
// can be reused for every selection and released together with the project.
const referenceIndexes = new WeakMap();

function referenceIndex(project) {
  if (referenceIndexes.has(project)) return referenceIndexes.get(project);
  const readersAndWriters = new Map();
  const addressesByRung = new Map();
  for (const rung of project.rungs) {
    const addresses = new Set([
      ...rung.reads,
      ...rung.writes.map((write) => write.address),
    ]);
    addressesByRung.set(rung.id, addresses);
    for (const address of addresses) {
      if (!readersAndWriters.has(address)) readersAndWriters.set(address, []);
      readersAndWriters.get(address).push(rung.id);
    }
  }
  const index = { readersAndWriters, addressesByRung };
  referenceIndexes.set(project, index);
  return index;
}

export function neighborhood(project, root, depth = 1) {
  const { readersAndWriters, addressesByRung } = referenceIndex(project);
  const devices = new Set([root]);
  const rungs = new Set();
  let frontier = [root];
  for (let level = 0; level < depth && frontier.length; level++) {
    const next = [];
    for (const device of frontier) {
      for (const rungId of readersAndWriters.get(device) || []) {
        if (rungs.has(rungId)) continue;
        rungs.add(rungId);
        for (const address of addressesByRung.get(rungId)) {
          if (devices.has(address)) continue;
          devices.add(address);
          next.push(address);
        }
      }
    }
    frontier = next;
  }
  return { devices: [...devices], rungs: [...rungs] };
}
export function searchDevices(project, query) {
  const term = query.trim().toLocaleLowerCase();
  return project.devices.filter((d) =>
    `${d.address} ${d.comment || ''}`.toLocaleLowerCase().includes(term),
  );
}
