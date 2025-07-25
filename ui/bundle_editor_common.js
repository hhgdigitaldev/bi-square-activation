/*
 * Copyright (C) 2024 Xibo Signage Ltd
 *
 * Xibo - Digital Signage - https://xibosignage.com
 *
 * This file is part of Xibo.
 *
 * Xibo is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * any later version.
 *
 * Xibo is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Xibo.  If not, see <http://www.gnu.org/licenses/>.
 */

// --- Add NPM Packages - JS ----
import './public_path';

// Masonry
window.Masonry = require('masonry-layout');

// images loaded
const imagesLoaded = require('imagesloaded');
// provide jQuery argument
imagesLoaded.makeJQueryPlugin( window.$ );

// moveable
window.Moveable = require('moveable/dist/moveable.min.js');
window.Selecto = require('selecto/dist/selecto.min.js');

// Leader Line
import {LeaderLine}
  from 'exports-loader?exports=LeaderLine!leader-line/leader-line.min.js';
window.LeaderLine = LeaderLine;
