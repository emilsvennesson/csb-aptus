import { parse } from 'node-html-parser';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));

export interface Door {
  name: string;
  id: string;
}

export class CsbAptus {
  private isLoggedIn: boolean;

  constructor() {
    this.isLoggedIn = false;
  }

  async login(username: string, password: string): Promise<boolean> {
    const url = 'https://www.chalmersstudentbostader.se/wp-login.php';
    const params = new URLSearchParams({
      log: username,
      pwd: password,
      redirect_to: '',
    });

    const response = await client.post(url, params);
    const cookies = response.headers['set-cookie'];
    if (!cookies) throw new Error('No cookies');
    let success = false;
    cookies.forEach((cookie) => {
      if (cookie.includes('wordpress_logged_in')) success = true;
    });

    this.isLoggedIn = success;
    return success;
  }

  async getAptusUrl(): Promise<string> {
    this.checkLoginStatus();
    const url = 'https://www.chalmersstudentbostader.se/widgets/';
    const widget = 'aptuslogin@APTUSPORT';
    const params = new URLSearchParams({
      callback: '',
      'widgets[]': widget,
    });
    const response = await client(`${url}?${params}`);
    const { data } = response;
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
    const response = await client(url);
    const { data } = response;
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
    const response = await client(url);
    const { data } = response;
    if (data.StatusText !== 'Dörren är upplåst')
      throw new Error(data.StatusText);
    return true;
  }

  private checkLoginStatus(): void {
    if (!this.isLoggedIn) throw new Error('UserNotLoggedIn');
  }
}
