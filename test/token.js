const { assert } = require("chai");

describe("XHDX", function() {
  let token, owner;

  beforeEach(async function() {
    [owner, alice] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("XHDX");
    token = await Token.deploy();
  });

  it("deployed", async function() {
    assert.ok(await token.deployed());
  });

  it("minted", async function() {
    assert.isAbove(await token.balanceOf(owner.address), 0);
    assert.equal(await token.balanceOf(alice.address), 0);
  });

  it("transferable", async function() {
    await token.transfer(alice.address, 10);
    assert.equal(await token.balanceOf(alice.address), 10);
  });

  describe("paused", async function() {

    beforeEach(async function() {
      await token.pause();
    });

    it("not transferable", async function() {
      try {
        await token.transfer(alice.address, 10);
        assert.fail();
      } catch (e) {
        assert.ok(true);
      }
    });

    it("unpaused", async function() {
      await token.unpause();
      await token.transfer(alice.address, 10);
    });

  });
});
