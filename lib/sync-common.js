/**
 * Copyright 2017-2019, 2026 University Of Helsinki (The National Library Of Finland)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Cooldown for the recent-changes manager: if the caretaker itself made the
// same change within this window, the change is considered a confirmation of
// its own work and is skipped.
const RECENT_CHANGE_COOLDOWN_MS = 20000;

// Creates a logger that writes through a debug function, used as the default
// logger when no logger is provided in options.
function createDefaultLogger(debug) {
  return { log: (level, message) => debug(`${level}: ${message}`) };
}

module.exports = {
  RECENT_CHANGE_COOLDOWN_MS,
  createDefaultLogger
};
