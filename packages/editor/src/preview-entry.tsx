import React from 'react';
import { render } from '@tower-ui/core';
import { WebAdapter } from '@tower-ui/web-adapter';

const container = document.getElementById('canvas-frame');
if (container) {
  const adapter = new WebAdapter(container);
  render(
    React.createElement('ui-view', { width: 100, height: 100 }),
    adapter,
    { width: 100, height: 100 },
  );
}
