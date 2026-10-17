/**
 * Parser for Her Interactive Game Identity (.cid) files.
 */
export class CidParser {
  /**
   * @param {string|Buffer} content
   */
  constructor(content) {
    this.text = Buffer.isBuffer(content) ? content.toString('utf8') : String(content);
  }

  /**
   * Parses the .cid content into structured game metadata.
   * @returns {{ gameId: string, title: string, series: string, company: string }}
   */
  parse() {
    const lines = this.text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    return {
      gameId: lines[0] ?? '',
      title: lines[1] ?? '',
      series: lines[2] ?? '',
      company: lines[3] ?? '',
    };
  }
}
