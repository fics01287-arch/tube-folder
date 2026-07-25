// 구글 드라이브 appDataFolder 백엔드 — PWA(독립 웹페이지) 컨텍스트 전용.
// googleDrive.ts(크롬 확장용)와 같은 파일(tubefolder-data.json)·같은 appDataFolder를 그대로
// 읽고 쓴다 — REST 로직은 driveBackendBase.ts에 공용화돼 있고, 여기서는 토큰을 GIS(웹 로그인)로
// 받아오는 부분만 다르다.

import { DriveBackendBase } from './driveBackendBase';
import { getWebToken, invalidateWebToken, isGisConfigured, revokeWebToken } from './googleIdentityWeb';

export class GoogleDriveWebBackend extends DriveBackendBase {
  available(): boolean {
    return isGisConfigured();
  }

  protected getToken(interactive: boolean): Promise<string> {
    return getWebToken(interactive);
  }

  protected async invalidateToken(token: string): Promise<void> {
    invalidateWebToken(token);
  }

  protected async revokeToken(token: string): Promise<void> {
    await revokeWebToken(token);
  }
}
