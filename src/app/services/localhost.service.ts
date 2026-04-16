import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

/**
 * Service to detect and manage localhost-only features.
 * Used to gate debug and development tools that should only be available in development.
 */
@Injectable({ providedIn: 'root' })
export class LocalhostService {
  private document = inject(DOCUMENT);

  /**
   * Determines if the app is running on localhost or a local IP address.
   * @returns true if running on localhost, 127.0.0.1, or similar local addresses
   */
  isLocalhost(): boolean {
    const hostname = this.document.location.hostname;
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' || // IPv6 localhost
      hostname.startsWith('192.168.') || // Private network
      hostname.startsWith('10.') || // Private network
      this.isPrivate172Range(hostname) // Private network
    );
  }

  private isPrivate172Range(hostname: string): boolean {
    const octets = hostname.split('.');

    if (octets.length !== 4) {
      return false;
    }

    const firstOctet = Number(octets[0]);
    const secondOctet = Number(octets[1]);

    return (
      Number.isInteger(firstOctet) &&
      Number.isInteger(secondOctet) &&
      firstOctet === 172 &&
      secondOctet >= 16 &&
      secondOctet <= 31
    );
  }
}
