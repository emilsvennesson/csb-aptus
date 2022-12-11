import makeFetchCookie from 'fetch-cookie';
import { parse } from 'node-html-parser';

export interface Door {
  name: string;
  id: string;
}

export class CsbAptus {
  private fetchCookie;

  private isLoggedIn: boolean;

  constructor() {
    this.fetchCookie = makeFetchCookie(
      fetch,
      new makeFetchCookie.toughCookie.CookieJar(),
    );
    this.isLoggedIn = false;
  }

  async login(username: string, password: string): Promise<boolean> {
    const url = 'https://www.chalmersstudentbostader.se/wp-login.php';
    const params = new URLSearchParams({ log: username, pwd: password });
    const response = await this.fetchCookie(url, {
      method: 'post',
      body: params,
      redirect: 'manual',
    });
    const redirectUrl = response.headers.get('location');
    const success = !redirectUrl?.includes('?err'); // csb redirects to login/?err=login on failure

    this.isLoggedIn = success;
    return success;
  }

  private async getAptusUrl(): Promise<string> {
    this.checkLoginStatus();
    const url = 'https://www.chalmersstudentbostader.se/widgets/';
    const widget = 'aptuslogin@APTUSPORT';
    const params = new URLSearchParams({
      callback: '',
      'widgets[]': widget,
    });
    const response = await this.fetchCookie(`${url}?${params}`);
    const data = await response.text();
    // sorry mom for this horrible parsing
    const jsonData = JSON.parse(
      data.slice(0, -2).replace(`${data.split('(')[0]}(`, ''),
    );
    return encodeURI(jsonData.data[widget].objekt[0].aptusUrl);
  }

  async getDoors(): Promise<Door[]> {
    this.checkLoginStatus();
    const doors: Door[] = [];
    const url = await this.getAptusUrl();
    const response = await this.fetchCookie(url);
    const data = await response.text();
    const root = parse(data);
    const doorsRoot = root.querySelectorAll('div.lockCard.animation');

    doorsRoot.forEach((element) => {
      const name = element.querySelector('span')?.text;
      const { id } = element;
      if (name && id) doors.push({ name, id: id.split('_')[1] });
    });

    return doors;
  }

  async openDoor(doorId: string): Promise<boolean> {
    this.checkLoginStatus();
    const url = `https://apt-www.chalmersstudentbostader.se/AptusPortal/Lock/UnlockEntryDoor/${doorId}`;
    const response = await this.fetchCookie(url);
    const isJson = response.headers
      .get('content-type')
      ?.includes('application/json');
    if (isJson) {
      const data = await response.json();
      if (data.StatusText !== 'Dörren är upplåst')
        throw new Error(data.StatusText);
      return true;
    }
    throw new Error('Unexpected response');
  }

  private checkLoginStatus(): void {
    if (!this.isLoggedIn) throw new Error('UserNotLoggedIn');
  }
}
