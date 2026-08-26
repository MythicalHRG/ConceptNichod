declare module 'react-simple-captcha' {
  import { ComponentType } from 'react';

  export function loadCaptchaEnginge(
    numberOfCharacters: number,
    backgroundColor?: string,
    fontColor?: string,
    charaterArray?: any[]
  ): void;

  export const LoadCanvasTemplate: ComponentType<any>;
  export const LoadCanvasTemplateNoReload: ComponentType<any>;

  export function validateCaptcha(
    userValue: string,
    reload?: boolean
  ): boolean;
}
