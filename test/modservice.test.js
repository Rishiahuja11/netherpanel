const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ModService = require('../src/services/ModService');

describe('ModService loader matching', () => {
  it('bukkit-family servers map to paper/folia/bukkit loaders', () => {
    for (const type of ['paper', 'spigot', 'purpur', 'folia', 'bukkit']) {
      assert.deepEqual(ModService.getCompatibleLoaders({ server_type: type }),
        ['paper', 'spigot', 'purpur', 'folia', 'bukkit']);
    }
  });

  it('nukkit-family servers search nukkit loaders only', () => {
    assert.deepEqual(ModService.getCompatibleLoaders({ server_type: 'nukkit' }), ['nukkit', 'nukkitx']);
    assert.deepEqual(ModService.getCompatibleLoaders({ server_type: 'powernukkit' }), ['nukkit', 'nukkitx']);
  });

  it('mod servers have no loader whitelist', () => {
    for (const type of ['forge', 'fabric', 'quilt', 'neoforge', 'vanilla', 'bedrock']) {
      assert.equal(ModService.getCompatibleLoaders({ server_type: type }), null);
    }
  });

  it('filterVersionsByLoaders picks matching loaders', () => {
    const versions = [
      { id: 'a', loaders: ['fabric'] },
      { id: 'b', loaders: ['neoforge'] },
      { id: 'c', loaders: ['paper', 'folia'] },
      { id: 'd', loaders: [] }
    ];
    const result = ModService.filterVersionsByLoaders(versions, ['paper', 'folia', 'bukkit']);
    assert.deepEqual(result.map(v => v.id), ['c']);
  });

  it('vanilla and bedrock servers return empty search without hitting the network', async () => {
    for (const type of ['vanilla', 'bedrock']) {
      const res = await ModService.searchForServer('spark', type);
      assert.equal(res.hits.length, 0);
      assert.equal(res.source, 'none');
      assert.ok(res.message);
    }
  });
});