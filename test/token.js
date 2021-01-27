const { assert } = require("chai");

describe("xHDX", function() {
  let token, owner, alice;

  beforeEach(async function() {
    [owner, alice] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("XHDX");
    token = await Token.deploy();
  });

  it("deployed", async function() {
    assert.ok(await token.deployed());
  });

  it("decimals", async function() {
    assert.equal(await token.decimals(), 12);
  });

  it("minted", async function() {
    assert.isAbove(await token.balanceOf(owner.address), 0);
    assert.equal(await token.balanceOf(alice.address), 0);
  });

  it("500m", async function() {
    const [decimals, balance, supply] = await Promise.all([
        token.decimals(),
        token.balanceOf(owner.address),
        token.totalSupply()
    ]);
    assert.equal(balance.toString(), supply.toString());
    assert.equal(balance, 500 * 1000000 * 10 ** decimals);
  });

  it("transferable", async function() {
    await token.transfer(alice.address, 10);
    assert.equal(await token.balanceOf(alice.address), 10);
  });

  it("only pauser can pause", async function() {
    try {
      await token.connect(alice).pause();
      assert.fail();
    } catch ({ message }) {
      assert.ok(message.includes("caller does not have the Pauser role"));
    }
  });

  it("add pauser", async function() {
    await token.addPauser(alice.address);
    await token.connect(alice).pause();
    assert.ok(await token.isPauser(alice.address));
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
        assert.ok(e.message.includes("paused"));
      }
    });

    it("unpaused", async function() {
      await token.unpause();
      await token.transfer(alice.address, 10);
    });

    it("only pauser can unpause", async function() {
      try {
        await token.connect(alice).unpause();
        assert.fail();
      } catch ({ message }) {
        assert.ok(message.includes("caller does not have the Pauser role"));
      }
    });

  });
});
