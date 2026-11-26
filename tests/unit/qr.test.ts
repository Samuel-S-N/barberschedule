import { qrMatrix } from "../../src/features/shops/qr";

describe("qrMatrix", () => {
  it("returns a square matrix of booleans", () => {
    const matrix = qrMatrix("https://shop-a.zencpro.app/");

    expect(matrix.length).toBeGreaterThanOrEqual(21);
    for (const row of matrix) expect(row).toHaveLength(matrix.length);
    expect(matrix.flat().every((cell) => typeof cell === "boolean")).toBe(true);
  });

  it("has the three finder patterns (7x7 dark squares in three corners)", () => {
    const matrix = qrMatrix("https://shop-a.zencpro.app/");
    const last = matrix.length - 1;

    for (const [row, col] of [[0, 0], [0, last - 6], [last - 6, 0]]) {
      expect(matrix[row][col]).toBe(true);
      expect(matrix[row][col + 6]).toBe(true);
      expect(matrix[row + 6][col]).toBe(true);
      expect(matrix[row + 6][col + 6]).toBe(true);
      expect(matrix[row + 3][col + 3]).toBe(true);
    }
  });

  it("is deterministic and differs between inputs", () => {
    expect(qrMatrix("https://a.zencpro.app/")).toEqual(qrMatrix("https://a.zencpro.app/"));
    expect(qrMatrix("https://a.zencpro.app/")).not.toEqual(qrMatrix("https://b.zencpro.app/"));
  });
});
