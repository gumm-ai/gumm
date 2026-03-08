import type { ToolDefinition } from '../../../back/utils/module-types';

const imageSource = {
  storageKey: {
    type: 'string',
    description:
      'Gumm storage key of the source image (e.g. "attachments/cli/123_photo.jpg"). Use this for images already uploaded to Gumm.',
  },
  url: {
    type: 'string',
    description:
      'Public URL of the image to download and process (must start with http:// or https://).',
  },
};

export function tools(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'image_info',
        description:
          'Get metadata for an image: width, height, format, number of channels, alpha channel presence, and file size. Use this to inspect an image before processing it.',
        parameters: {
          type: 'object',
          properties: { ...imageSource },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'image_resize',
        description:
          'Resize an image to the given dimensions. Use "fit" to control how the image is scaled: "cover" (crop to fill, default), "contain" (letterbox), "fill" (stretch), "inside" (shrink to fit), "outside" (enlarge to fit). Returns the storage key of the resized image.',
        parameters: {
          type: 'object',
          properties: {
            ...imageSource,
            width: {
              type: 'number',
              description:
                'Target width in pixels. Omit to scale proportionally based on height.',
            },
            height: {
              type: 'number',
              description:
                'Target height in pixels. Omit to scale proportionally based on width.',
            },
            fit: {
              type: 'string',
              enum: ['cover', 'contain', 'fill', 'inside', 'outside'],
              description:
                'How to fit the image into the target dimensions. Defaults to "cover".',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'image_convert',
        description:
          'Convert an image to a different format (JPEG, PNG, WebP, AVIF, TIFF). Optionally set quality (1–100, default 85) for lossy formats. Returns the storage key of the converted image.',
        parameters: {
          type: 'object',
          properties: {
            ...imageSource,
            format: {
              type: 'string',
              enum: ['jpeg', 'png', 'webp', 'avif', 'tiff'],
              description: 'Target format.',
            },
            quality: {
              type: 'number',
              description:
                'Compression quality from 1 (lowest) to 100 (highest). Applies to JPEG, WebP, AVIF. Defaults to 85.',
            },
          },
          required: ['format'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'image_crop',
        description:
          'Crop a rectangular region from an image. Specify the top-left corner (left, top) and the size (width, height) of the crop area in pixels. Returns the storage key of the cropped image.',
        parameters: {
          type: 'object',
          properties: {
            ...imageSource,
            left: {
              type: 'number',
              description:
                'X offset of the top-left corner of the crop area (pixels from left).',
            },
            top: {
              type: 'number',
              description:
                'Y offset of the top-left corner of the crop area (pixels from top).',
            },
            width: {
              type: 'number',
              description: 'Width of the crop area in pixels.',
            },
            height: {
              type: 'number',
              description: 'Height of the crop area in pixels.',
            },
          },
          required: ['left', 'top', 'width', 'height'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'image_rotate',
        description:
          'Rotate an image by the specified angle in degrees (clockwise). Use 90, 180, or 270 for lossless rotation on JPEG. Other angles fill the background with the specified color. Returns the storage key of the rotated image.',
        parameters: {
          type: 'object',
          properties: {
            ...imageSource,
            angle: {
              type: 'number',
              description:
                'Rotation angle in degrees (clockwise). Common values: 90, 180, 270. Any positive or negative integer is accepted.',
            },
            background: {
              type: 'string',
              description:
                'Background fill color for non-right-angle rotations (CSS color string, e.g. "#ffffff" or "transparent"). Defaults to transparent.',
            },
          },
          required: ['angle'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'image_filter',
        description:
          'Apply a visual filter to an image. Available filters: "grayscale" (remove color), "blur" (Gaussian blur), "sharpen" (increase sharpness), "negate" (invert colors), "normalize" (enhance contrast), "flip" (mirror vertically), "flop" (mirror horizontally). Returns the storage key of the filtered image.',
        parameters: {
          type: 'object',
          properties: {
            ...imageSource,
            filter: {
              type: 'string',
              enum: [
                'grayscale',
                'blur',
                'sharpen',
                'negate',
                'normalize',
                'flip',
                'flop',
              ],
              description: 'The filter to apply.',
            },
            blur_sigma: {
              type: 'number',
              description:
                'Blur intensity (sigma) when filter is "blur". Range 0.3–1000. Defaults to 2.',
            },
          },
          required: ['filter'],
        },
      },
    },
  ];
}
