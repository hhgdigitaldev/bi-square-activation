<?php
/*
 * Copyright (C) 2025 Xibo Signage Ltd
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

use Phinx\Migration\AbstractMigration;

/**
 * Add some additional fields to menu boards
 * @phpcs:disable PSR1.Classes.ClassDeclaration.MissingNamespace
 */
class UpsertInteractiveButtonInModuleTableMigration extends AbstractMigration
{
    public function change(): void
    {
        // Check if the core-interactive-button row exists
        $row = $this->fetchRow("SELECT * FROM `module` WHERE `moduleId` = 'core-interactive-button'");

        if (!$row) {
            // Row does not exist, insert new row
            $this->execute("
                INSERT INTO `module` (`moduleId`, `enabled`, `previewEnabled`, `defaultDuration`, `settings`)
                VALUES ('core-interactive-button', '1', '1', '60', NULL)
            ");
        } else {
            // Row exists, update existing row
            $this->execute("
                UPDATE `module`
                SET `enabled` = '1',
                    `previewEnabled` = '1',
                    `defaultDuration` = '60',
                    `settings` = NULL
                WHERE `moduleId` = 'core-interactive-button'
            ");
        }
    }
}
