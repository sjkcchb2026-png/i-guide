import { LocationResult } from '../types';

export class GeolocationError extends Error {
  code: number;
  constructor(message: string, code: number = 0) {
    super(message);
    this.name = 'GeolocationError';
    this.code = code;
  }
}

/**
 * Retrieves the device's high-accuracy GPS position.
 * Strictly verifies network connectivity and coordinates.
 */
export async function getCurrentGPSPosition(): Promise<LocationResult> {
  // 1. Verify Internet Connection
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new GeolocationError(
      '检测到当前设备无网络连接，无法打卡！请检查 Wi-Fi 或移动数据网络。\n(Tiada sambungan internet dikesan. Sila sambung ke internet.)',
      100
    );
  }

  // 2. Verify Geolocation API Availability
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new GeolocationError(
      '您的浏览器或设备不支持 GPS 定位功能，无法完成打卡。\n(Pelayar peranti anda tidak menyokong fungsi GPS.)',
      101
    );
  }

  // 3. Request GPS coordinates with high accuracy
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        // Verify valid coordinates
        if (typeof latitude !== 'number' || typeof longitude !== 'number' || isNaN(latitude) || isNaN(longitude)) {
          reject(
            new GeolocationError(
              '取得的 GPS 坐标无效，打卡未成功。\n(Koordinat GPS tidak sah. Sila cuba lagi.)',
              102
            )
          );
          return;
        }

        resolve({
          latitude: Number(latitude.toFixed(7)),
          longitude: Number(longitude.toFixed(7)),
          accuracy: Math.round(accuracy),
          timestamp: position.timestamp,
        });
      },
      (error) => {
        let msg = '定位失败，无法打卡。';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            msg =
              '定位失败：已拒绝位置访问权限！\n打卡必须取得当前地理位置。请在手机浏览器（Safari/Chrome）网站设定中将“位置权限”设为“允许”。\n(Kebenaran lokasi ditolak. Sila benarkan akses lokasi GPS pada pelayar telefon anda.)';
            break;
          case error.POSITION_UNAVAILABLE:
            msg =
              '定位失败：目前无法检测到 GPS 信号。请移步至室外或窗边并确保开启手机定位服务。\n(Isyarat GPS tidak dapat dikesan. Sila aktifkan GPS telefon anda.)';
            break;
          case error.TIMEOUT:
            msg =
              '定位失败：获取 GPS 信号超时，未能取得有效坐标。请重试。\n(Masa tamat mendapatkan lokasi GPS. Sila cuba sekali lagi.)';
            break;
          default:
            msg = `定位失败 (${error.message || '未知错误'})，打卡未成功。\n(Ralat lokasi GPS. Kehadiran belum direkodkan.)`;
            break;
        }
        reject(new GeolocationError(msg, error.code));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  });
}

/**
 * Format coordinates for Principal view and Google Maps linking
 */
export function formatCoordinates(lat?: number, lng?: number, accuracy?: number): string {
  if (typeof lat !== 'number' || typeof lng !== 'number') return '无坐标数据';
  const acc = typeof accuracy === 'number' ? ` (精度 ±${accuracy}m)` : '';
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}${acc}`;
}

export function getGoogleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
