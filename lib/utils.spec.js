const expect = require('chai').expect;

const utils = require('./utils');


describe('utils', () => {
  const fakePatch = { prev: [], next: [] };
  const fakeLibrary = 'FIN01';
  
  describe('RecentChangesManager', () => {
    it('should return false if the change is first one', () => {
      let fakeRecordId = '1';
      const mgr = utils.RecentChangesManager(1000);
      const wasRecentlyChanged = mgr.checkAndUpdateRecentChanges(fakeLibrary, fakeRecordId, fakePatch);

      expect(wasRecentlyChanged).to.be.false;
    });

    it('should return true if the same change as just made', () => {
      let fakeRecordId = '1';
      const mgr = utils.RecentChangesManager(1000);
      mgr.checkAndUpdateRecentChanges(fakeLibrary, fakeRecordId, fakePatch);
      const wasRecentlyChanged = mgr.checkAndUpdateRecentChanges(fakeLibrary, fakeRecordId, fakePatch);

      expect(wasRecentlyChanged).to.be.true;
    });

    it('should return false for changes that are older than cooldown', () => {
      let fakeRecordId = '1';
      const mgr = utils.RecentChangesManager(1000);
      const timeAtFirstChange = 0;
      const timeAtSecondChange = 1500;
      mgr.checkAndUpdateRecentChanges(fakeLibrary, fakeRecordId, fakePatch, timeAtFirstChange);
      const wasRecentlyChanged = mgr.checkAndUpdateRecentChanges(fakeLibrary, fakeRecordId, fakePatch, timeAtSecondChange);

      expect(wasRecentlyChanged).to.be.false;
    });
  });
});
