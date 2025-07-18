/*
 * Copyright (C) 2023 Xibo Signage Ltd
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

// PROPERTIES PANEL Module

const loadingTemplate = require('../templates/loading.hbs');
const messageTemplate = require('../templates/properties-panel-message.hbs');
const propertiesPanelTemplate = require('../templates/properties-panel.hbs');
const actionsFormContentTemplate =
  require('../templates/actions-form-content-template.hbs');
const actionFormActionEditTemplate =
  require('../templates/actions-form-action-edit-template.hbs');
const actionFormActionViewTemplate =
  require('../templates/actions-form-action-view-template.hbs');

const formTemplates = {
  widget: require('../templates/forms/widget.hbs'),
  region: require('../templates/forms/region.hbs'),
  layout: require('../templates/forms/layout.hbs'),
  position: require('../templates/forms/position.hbs'),
  message: require('../templates/forms/inputs/message.hbs'),
};
const actionTypesAndRules = {
  nextLayout: {
    targetType: 'screen',
    targetTypeFilter: ['layouts'],
    subType: 'next',
  },
  previousLayout: {
    targetType: 'screen',
    targetTypeFilter: ['layouts'],
    subType: 'previous',
  },
  nextWidget: {
    targetType: 'region',
    targetTypeFilter: ['playlists'],
    subType: 'next',
  },
  previousWidget: {
    targetType: 'region',
    targetTypeFilter: ['playlists'],
    subType: 'previous',
  },
  navLayout: {
    targetTypeFilter: ['layouts'],
    subTypeFixed: 'navLayout',
  },
  navWidget: {
    targetTypeFilter: ['playlists', 'regions'],
    subTypeFixed: 'navWidget',
  },
};

/**
 * Properties panel contructor
 * @param {object} parent - the parent object
 * @param {object} container - the container to render the panel to
 */
const PropertiesPanel = function(parent, container) {
  this.parent = parent;
  this.DOMObject = container;

  // Initialy loaded data on the form
  this.formSerializedLoadData = {
    layout: '',
    region: '',
    widget: '',
    position: '',
  };

  this.inlineEditor = false;

  this.openTabOnRender = '';

  this.toSave = false;
  this.toSaveElementCallback = null;
};

/**
 * Save properties from the panel form
 * @param {object=} target - the element that the form relates to
 * @param {boolean=} [reloadAfterSave=true] - Refresh editor after save request
 * @param {boolean=} [showErrorMessages=true] - Display error messages
 * @param {function=} [callback=null] - Callback to be called after request
 * @param {function=} [callbackNoWait=null]
 *   - Callback to be called before request ends
 * @return {boolean} - false if form is invalid
 */
PropertiesPanel.prototype.save = function(
  {
    target = null,
    reloadAfterSave = true,
    showErrorMessages = true,
    callback = null,
    callbackNoWait = null,
    forceSave = false,
  } = {},
) {
  const app = this.parent;
  const self = this;
  const form = $(this.DOMObject).find('form');
  let savingElement = false;
  let savingElementGroup = false;

  // If target isn't set, use selected object
  // If it's interactiveEditWidgetMode, use action widget
  if (!target) {
    if (app.interactiveEditWidgetMode) {
      target = app.getObjectByTypeAndId(
        'widget',
        'widget_' + app.layout.drawer.regionId +
          '_' + app.actionManager.editing.widgetId,
        'drawer',
      );
    } else {
      target = app.selectedObject;
    }
  }

  // Check if target is region
  const isRegion = target.type === 'region';

  // Save original target
  const originalTarget = target;

  // If main container has inline editing class, remove it
  app.editorContainer.removeClass('inline-edit-mode');

  // If inline editor and viewer exist
  if (this.inlineEditor && (typeof app.viewer != 'undefined')) {
    app.viewer.hideInlineEditor();
  }

  // If target is element or element group
  // switch the target to be the widget of that element
  if (
    target.type === 'element' ||
    target.type === 'element-group'
  ) {
    target = app.getObjectByTypeAndId(
      'widget',
      'widget_' + originalTarget.regionId + '_' + originalTarget.widgetId,
      'canvas',
    );

    // Mark the element widget as needed to reload data
    target.forceRecalculateData = true;


    // Save element properties
    if (originalTarget.type === 'element') {
      savingElement = true;
    } else {
      savingElementGroup = true;
    }
  }

  // Run form submit module optional function
  if (target.type === 'widget') {
    formHelpers.widgetFormEditBeforeSubmit(this.DOMObject, target.subType);

    const errors = formHelpers.validateFormBeforeSubmit(this.DOMObject);

    if (errors !== null && showErrorMessages) {
      const errorMessage = Object.values(errors).join('</br>');
      // Display message in form
      formHelpers.displayErrorMessage(form, errorMessage, 'danger');

      // Call callback without waiting for the request
      (callbackNoWait) && callbackNoWait();

      // Mark form as not needed to be saved anymore
      this.toSave = false;
      return false;
    } else {
      formHelpers.clearErrorMessage(form);
    }
  }

  let requestPath;
  if (form.attr('action') != undefined && form.attr('method') != undefined) {
    // Get custom path
    requestPath = {
      url: form.attr('action'),
      type: form.attr('method'),
    };
  }

  // Get form data to save based on the target type
  let formFieldsToSave = (savingElement) ?
    form.find('[name]:not(.element-property)') :
    form.find('[name]');

  // Filter out position related fields
  // if not region
  formFieldsToSave = (isRegion) ? formFieldsToSave :
    formFieldsToSave.filter('.tab-pane:not(#positionTab) [name]');

  // Get form old data
  const formOldData = this.formSerializedLoadData[target.type];

  // Get form data
  // if we're saving an element, don't include the element properties
  const formNewData = formFieldsToSave.serialize();

  // If form is valid, submit it ( add change )
  if (
    formFieldsToSave.length > 0 &&
    formFieldsToSave.valid() &&
    // if form data is the same, don't save if not forced
    (
      formOldData != formNewData ||
      forceSave
    )
  ) {
    app.common.showLoadingScreen();

    // If it's a layout, save its resolution
    const resolutionId = (target.type === 'layout') ?
      formFieldsToSave.filter('[name="resolutionId"]').val() :
      null;

    // Add a save form change to the history array
    // with previous form state and the new state
    app.historyManager.addChange(
      'saveForm',
      target.type, // targetType
      target[target.type + 'Id'], // targetId
      formOldData, // oldValues
      formNewData, // newValues
      {
        customRequestPath: requestPath,
      },
    ).then((_res) => {
      const data = _res;

      // Success
      app.common.hideLoadingScreen();

      // Stop if not available
      if (Object.keys(self).length === 0) {
        return;
      }

      // Updated saved form data
      self.formSerializedLoadData[target.type] = formNewData;

      // Clear error message
      formHelpers.clearErrorMessage(form);

      const reloadData = function() {
        const mainObject =
          app.getObjectByTypeAndId(app.mainObjectType, app.mainObjectId);

        // If we're saving a widget, reload region on the viewer
        if (
          !(savingElement || savingElementGroup) &&
          target.type === 'widget' &&
          app.viewer
        ) {
          // Reload data, but only render the region that the widget is in
          app.reloadData(
            mainObject,
            {
              reloadPropertiesPanel: false,
            },
          ).then(() => {
            if (!target.drawerWidget) {
              app.viewer.renderRegion(
                app.getObjectByTypeAndId('region', target.regionId),
              );
            } else {
              app.viewer.renderRegion(
                app.layout.drawer,
                target,
              );
            }
          });
        } else if (app.mainObjectType == 'playlist') {
          // Reload data, but don't refresh
          // toolbar or properties panel
          app.reloadData(
            {
              reloadToolbar: false,
              reloadPropertiesPanel: false,
            },
          );
        } else if (target.type === 'layout') {
          // Update resolution id
          app.layout.resolutionId = resolutionId;

          // Update layout
          app.layout.updateData(data.data);

          // Render top bar to update layout changes
          app.topbar.render();

          // Render viewer to reflect changes
          app.viewer.render(true);

          // Render layer manager
          app.viewer.layerManager.render();
        } else {
          // Reload data, and refresh viewer if layout
          // or if we're saving an element
          // but don't reload properties panel
          app.reloadData(
            mainObject,
            {
              refreshEditor: (target.type === 'layout'),
              reloadPropertiesPanel: false,
            },
          ).then(() => {
            // Stop if not available
            if (Object.keys(self).length === 0) {
              return;
            }

            // Save element
            if (savingElement) {
              // Reload Data and then save element
              // Only save after having saved the widget
              self.saveElement(
                originalTarget,
                form.find('[name].element-property'),
              );
            }

            // Save elements or element groups
            if (
              savingElement ||
              savingElementGroup
            ) {
              // If we're saving an element, reload all elements
              // from the widget that the element is in
              for (element in target.elements) {
                if (
                  Object.prototype.hasOwnProperty
                    .call(target.elements, element)
                ) {
                  app.viewer.renderElementContent(target.elements[element]);
                }
              }

              // If we're saving an element group, update bottom bar
              (savingElementGroup) &&
                app.bottombar.render(originalTarget);
            }

            // If we're saving a region, update bottom bar
            // update bottom bar
            if (originalTarget.type === 'region') {
              app.bottombar.render(
                app.getObjectByTypeAndId('region', originalTarget.regionId),
              );
            }
          });
        }
      };

      // Reload data
      if (reloadAfterSave) {
        reloadData();
      }

      // Call callback if exists
      (callback) && callback();
    }).catch((error) => { // Fail/error
      if (!showErrorMessages) {
        return;
      }

      app.common.hideLoadingScreen();

      // Show error returned or custom message to the user
      let errorMessage = '';

      if (typeof error == 'string') {
        errorMessage += error;
      } else {
        errorMessage += error.errorThrown;
      }
      // Remove added change from the history manager
      app.historyManager.removeLastChange();

      // Display message in form
      formHelpers.displayErrorMessage(form, errorMessage, 'danger');

      // If Save fails and we have an inline editor opened, reshow it
      if (app.propertiesPanel.inlineEditor) {
        app.viewer.showInlineEditor();
      }
    });

    // Call callback without waiting for the request
    (callbackNoWait) && callbackNoWait();

    // Mark form as not needed to be saved anymore
    this.toSave = false;
  }
};

/**
 * Save element properties
 * @param {*} target - the element that the form relates to
 * @param {*} properties - the properties to save
 * @param {boolean} positionChanged - if the position of the element has changed
 * @return {Promise} - Promise
 */
PropertiesPanel.prototype.saveElement = function(
  target,
  properties,
  positionChanged = false,
) {
  const app = this.parent;

  // Get parent widget
  const parentWidget = app.getObjectByTypeAndId(
    'widget',
    'widget_' + target.regionId + '_' + target.widgetId,
    'canvas',
  );

  // Form properties to the target element if they exist
  if (typeof properties != 'undefined') {
    const elementProperties =
      properties.map((_i, property) => {
        const propertyObject = {
          id: $(property).attr('name'),
          value: $(property).val(),
        };

        // If property is a checkbox
        if ($(property).attr('type') === 'checkbox') {
          propertyObject.value = $(property).is(':checked');
        }

        return propertyObject;
      }).get();

    // Make sure we copy current target to widget elements
    // but update position on target
    const targetAux = parentWidget.elements[target.elementId];
    target.width = targetAux.width;
    target.height = targetAux.height;
    target.top = targetAux.top;
    target.left = targetAux.left;
    target.layer = targetAux.layer;
    parentWidget.elements[target.elementId] = target;

    // Add to the element properties
    if (parentWidget.elements[target.elementId]) {
      parentWidget.elements[target.elementId].properties = elementProperties;
    }
  }

  // Mark to save as false
  this.toSaveElementCallback = null;

  // Save elements to the widget
  return parentWidget.saveElements({
    reloadData: false,
  }).then((_res) => {
    // Update element position
    if (positionChanged) {
      app.viewer.updateElement(parentWidget.elements[target.elementId]);
    } else {
      // Render element content
      app.viewer.renderElementContent(parentWidget.elements[target.elementId]);
    }
  });
};

/**
 * Delete selected element
 * @param {object} element - the element that the form relates to
 */
PropertiesPanel.prototype.delete = function(element) {
  const app = this.parent;
  app.deleteSelectedObject();
};

/**
 * Render panel
 * @param {Object} target - the element object to be rendered
 * @return {boolean} - result status
 */
PropertiesPanel.prototype.render = function(
  target,
) {
  const self = this;
  const app = this.parent;
  const minSlotValue = 1;
  let targetAux;
  let hasData = false;
  let isElement = false;
  let isElementGroup = false;

  // Hide panel if no target element is passed
  if (target == undefined || $.isEmptyObject(target)) {
    this.DOMObject.parent().addClass('closed');
    this.DOMObject.parents('.editor-modal')
      .toggleClass('properties-panel-opened', false);
    return;
  } else {
    this.DOMObject.parent().removeClass('closed');
    this.DOMObject.parents('.editor-modal')
      .toggleClass('properties-panel-opened', true);
  }

  const isEmptyActionWidget =
    (app.interactiveEditWidgetMode && target.type === 'layout');

  // If target is an element, change it to the widget
  // and save the element in a new variable
  if (target.type === 'element') {
    const elementId = target.elementId;
    const isSelected = target.selected;

    // Get widget and change target
    target = app.getObjectByTypeAndId(
      'widget',
      'widget_' + target.regionId + '_' + target.widgetId,
      'canvas',
    );

    // Get element from the widget
    targetAux = target.elements[elementId];
    targetAux.selected = isSelected;

    isElement = true;

    // Check if it's element with data
    hasData = targetAux.hasDataType;
  } else if (target.type === 'element-group') {
    const groupId = target.id;
    const isSelected = target.selected;

    // Get widget and set it as target
    target = app.getObjectByTypeAndId(
      'widget',
      'widget_' + target.regionId + '_' + target.widgetId,
      'canvas',
    );

    // Get element from the widget
    targetAux = target.elementGroups[groupId];

    // If element group is already deleted, stop rendering
    if (targetAux == undefined) {
      return;
    }

    targetAux.selected = isSelected;

    isElementGroup = true;

    // Check if it's element with data
    hasData = targetAux.hasDataType();
  }

  // Show a message if the module is disabled for a widget rendering
  if (
    target.type === 'widget' &&
    !target.enabled
  ) {
    // Show invalid module message
    this.DOMObject.html(messageTemplate({
      message: editorsTrans.invalidModule,
    }));

    return false;
  }

  // Reset inline editor to false on each refresh
  this.inlineEditor = false;

  // Clear temp data
  app.common.clearContainer(this.DOMObject);

  // Show loading template
  this.DOMObject.html(loadingTemplate());

  // Interactive mode
  if (app.interactiveMode) {
    // Create actions content
    this.renderActions();
    return;
  }

  // Build request path
  let requestPath = urlsForApi[target.type].getForm.url;
  requestPath = requestPath.replace(':id', target[target.type + 'Id']);

  // If there was still a render request, abort it
  if (this.renderRequest != undefined) {
    this.renderRequest.abort('requestAborted');
  }

  // Create a new request
  this.renderRequest = $.get(requestPath).done(function(res) {
    const app = self.parent;

    // Stop if not available
    if (Object.keys(self).length === 0) {
      return;
    }

    // Clear request var after response
    self.renderRequest = undefined;

    // Show uncussess request message
    if (res.success === false) {
      const errorMessage = (target.isEditable) ?
        propertiesPanelTrans.somethingWentWrong :
        propertiesPanelTrans.somethingWentWrongEditPermissions;

      self.DOMObject.html('<div class="unsuccessMessage">' +
        (
          (res.message) ?
            res.message :
            errorMessage
        ) + '</div>');
      return false;
    }

    // Render template
    const htmlTemplate = (isEmptyActionWidget) ?
      formTemplates['message'] :
      formTemplates[target.type];

    // Extend element with translation
    $.extend(res.data, {
      trans: propertiesPanelTrans,
    });

    // Create buttons object for the external playlist editor
    let buttons = {};
    let saveInitFormState = false;
    if (
      self.parent.mainObjectType == 'playlist' &&
      self.parent.inline === false
    ) {
      // Render save button
      buttons = formHelpers.widgetFormRenderButtons(formTemplates.buttons);
    } else if (
      app.interactiveEditWidgetMode
    ) {
      const isEdit = (target.type === 'widget');
      saveInitFormState = isEdit;

      // show cancel
      buttons['cancel'] = {
        name: propertiesPanelTrans.actions.cancelAction,
        type: 'btn-outline-primary',
        action: 'cancelEditActionWidget',
        subAction: (
          app.interactiveEditWidgetModeType == 1 ?
            'revertChanges' :
            'deleteWidget'),
      };

      // If target is existing widget, we're editing
      // show continue button
      if (isEdit) {
        buttons['continue'] = {
          name: propertiesPanelTrans.actions.continueAction,
          type: 'btn-primary',
          action: 'continueEditActionWidget',
        };
      }
    }

    // Data to be rendered
    const dataToRender = (isEmptyActionWidget) ?
      {
        customClass: 'no-widget-action-edit-message',
        variante: 'primary',
        title: propertiesPanelTrans.actions.createWidgetInZoneMessage,
      } :
      res.data;

    // If we have a widget, add the widgetId to the data
    if (target.type === 'widget') {
      dataToRender.target = target.widgetId;

      // Check if we can use is repeat data
      dataToRender.repeatDataActive = hasData;

      // Check required elements
      const warningMessage = target.checkRequiredElements();

      if (warningMessage != '') {
        dataToRender.showWarningMessage = true;
        dataToRender.warningMessage = warningMessage;
      }
    }

    // If the form is a layout
    // Add imageDownloadUrl and libraryAddUrl to the data
    if (target.type === 'layout' && !app.interactiveEditWidgetMode) {
      dataToRender.imageDownloadUrl = imageDownloadUrl;
      dataToRender.libraryAddUrl = libraryAddUrl;

      // Add new property:orientation
      dataToRender.orientation = lD.viewer.getLayoutOrientation(
        dataToRender.resolution.width, dataToRender.resolution.height);
      dataToRender.bgImageName = dataToRender.backgrounds[0]?.name || '';

      // Save resolution to layout for later use
      target.resolutionId = dataToRender.resolution.resolutionId;
    }

    // if region, add subtype name
    // and exit transition
    if (target.type === 'region') {
      const regionType = (target.subType === 'frame') ?
        'widgetType' : target.subType;
      dataToRender.regionType = propertiesPanelTrans[regionType];

      if (
        target.subType === 'playlist' ||
        target.subType === 'zone'
      ) {
        dataToRender.showExitTransition = true;
      }

      dataToRender.regionOptions = target.options;

      if (
        target.subType === 'frame' &&
        $.isEmptyObject(target.widgets)
      ) {
        self.DOMObject.html(
          '<div class="unsuccessMessage invalid-region-message">' +
          errorMessagesTrans.invalidRegion +
          '</div>');

        return;
      }
    }

    const propertiesPanelOptions = {
      header: res.dialogTitle,
      style: target.type,
      form: htmlTemplate(dataToRender),
      trans: propertiesPanelTrans,
    };

    if (!$.isEmptyObject(buttons)) {
      propertiesPanelOptions.buttons = buttons;
    }

    const html = propertiesPanelTemplate(propertiesPanelOptions);

    // Append layout html to the main div
    self.DOMObject.html(html);

    // Store the extra data
    self.DOMObject.data('extra', res.extra);

    // Check if there's a viewer element
    const viewerExists = (typeof app.viewer != 'undefined');
    self.DOMObject.data('formEditorOnly', !viewerExists);

    // If the viewer exists, save its data  to the DOMObject
    if (viewerExists) {
      self.DOMObject.data('viewerObject', app.viewer);
    }

    // Create the dynamic form fields
    // ( for now just for widget )
    if (target.type === 'widget') {
      // Create configure tab if we have properties
      if (res.data.module.properties.length > 0) {
        const widgetProperties = res.data.module.properties;

        // Configure tab
        forms.createFields(
          widgetProperties,
          self.DOMObject.find('#configureTab'),
          target.widgetId,
          target.playlistId,
          res.data.module.propertyGroups,
        );
      } else {
        // Remove configure tab
        self.DOMObject.find('[href="#configureTab"]').parent().remove();

        // Select advanced tab
        self.showTab('a[href="#advancedTab"]', false);
      }

      // Appearance tab
      const showAppearanceTab = (selectTab = false) => {
        // Show appearance tab
        self.DOMObject.find('.nav-link[href="#appearanceTab"]')
          .parent().removeClass('d-none');

        if (selectTab) {
          // Select appearance tab
          self.showTab('a[href="#appearanceTab"]', false);
        }
      };

      // If it's an element of type global
      // hide widget name input
      if (
        (isElement || isElementGroup) &&
        targetAux.elementType === 'global'
      ) {
        self.DOMObject.find('#advancedTab input[name="name"]')
          .each(function(_dx, el) {
            $(el).parent().hide();
          });
      }

      if (isElementGroup) {
        const groupProperties = [];
        // if it's an element group and we have a slot
        // add property to the top of appearance tab
        if (targetAux.slot !== undefined) {
          groupProperties.unshift(
            {
              id: 'pinSlot',
              title: propertiesPanelTrans.pinSlot,
              helpText: propertiesPanelTrans.pinSlotHelpText,
              customClass: 'element-slot-input',
              value: targetAux.pinSlot,
              type: 'checkbox',
              visibility: [],
            },
          );

          groupProperties.unshift({
            id: 'slot',
            title: propertiesPanelTrans.dataSlot,
            helpText: propertiesPanelTrans.dataSlotHelpText,
            customClass: 'element-slot-input',
            value: Number(targetAux.slot) + 1,
            min: minSlotValue,
            type: 'number',
            visibility: [],
          });
        }

        // if it's an element group and we have effect
        // add property to the top of appearance tab
        if (targetAux.effect !== undefined) {
          groupProperties.unshift({
            id: 'effect',
            title: propertiesPanelTrans.effect,
            helpText: propertiesPanelTrans.effectHelpText,
            value: targetAux.effect,
            type: 'effectSelector',
            variant: 'showPaged noNone',
            visibility: [],
          });
        }

        forms.createFields(
          groupProperties,
          self.DOMObject.find('#appearanceTab'),
          target.widgetId,
          false,
          null,
          'element-group element-group-property',
        );

        // if we created a new slot for element group input
        // handle when changed
        if (targetAux.slot !== undefined) {
          self.DOMObject.find('[name="slot"]').on('change', function(ev) {
            let slotValue = Number($(ev.currentTarget).val());

            // If value is lower than minSlotValue
            // set it to minSlotValue
            if (slotValue < minSlotValue) {
              slotValue = minSlotValue;
              $(ev.currentTarget).val(minSlotValue);
            }

            // update slot for the group
            targetAux.updateSlot(slotValue - 1, true);

            // Save elements
            target.saveElements({
              reloadData: false,
            }).then((_res) => {
              // Update group
              app.viewer.updateElementGroup(app.selectedObject);
            });
          });

          // Handle pin slot property
          self.DOMObject.find('[name="pinSlot"]').on('change', function(ev) {
            // update pin slot for the group
            targetAux.updatePinSlot($(ev.currentTarget).is(':checked'));

            // save elements
            target.saveElements();
          });
        }

        // if we created a new effect for element group input
        // handle when changed
        if (targetAux.effect !== undefined) {
          self.DOMObject.find('[name="effect"]')
            .on('change', function(ev, options) {
              if (!options?.skipSave) {
                let effectValue = $(ev.currentTarget).val();

                // If value is lower than minSlotValue
                // set it to minSlotValue
                if (String(effectValue).length === 0) {
                  effectValue = 'noTransition';
                  $(ev.currentTarget).val(effectValue);
                }

                // update slot for the group
                targetAux.updateEffect(effectValue, true);

                // save elements
                target.saveElements();

                // Render canvas again
                app.viewer.renderCanvas(app.layout.canvas);
              }
            });
        }

        // Add name field to advanced tab
        forms.createFields(
          [{
            id: 'elementGroupName',
            title: propertiesPanelTrans.elementGroupName,
            helpText: propertiesPanelTrans.elementGroupNameHelpText,
            customClass: 'element-group-name-input',
            value: targetAux.elementGroupName,
            type: 'text',
            visibility: [],
          }],
          self.DOMObject.find('#advancedTab'),
          targetAux.elementId,
          null,
          null,
          'element-group-property',
          true, // Prepend
        );

        // Trigger save on name change
        self.DOMObject.find('[name="elementGroupName"]')
          .on('change', function(ev, options) {
            if (!options?.skipSave) {
              // Update name for the group
              targetAux.elementGroupName = $(ev.currentTarget).val();

              // Save elements
              target.saveElements().then((_res) => {
                // Update bottom bar
                app.bottombar.render(targetAux);

                // Update layer manager
                app.viewer.layerManager.render();
              });
            }
          });

        showAppearanceTab();
      }

      // If we have a template for the widget, create the fields
      if (
        res.data.template != undefined &&
        res.data.template != 'elements' &&
        res.data.template.properties.length > 0
      ) {
        forms.createFields(
          res.data.template.properties,
          self.DOMObject.find('#appearanceTab'),
          target.widgetId,
          target.playlistId,
          res.data.template.propertyGroups,
        );

        // Show the appearance tab
        showAppearanceTab();
      }

      // If we need to render the element properties
      if (
        isElement
      ) {
        // Get element properties
        targetAux.getProperties().then((properties) => {
          // Create a clone of properties
          // so we don't modify the original object
          properties = JSON.parse(JSON.stringify(properties));

          // Create common fields
          const commonFields = [];

          // Show scaling type if element is in a group
          if (
            targetAux.groupId != '' &&
            targetAux.groupId != undefined
          ) {
            commonFields.unshift(
              {
                id: 'groupScale',
                customClass: 'group-scale-properties',
                title: propertiesPanelTrans.groupScale,
                helpText: propertiesPanelTrans.groupScaleHelpText,
                value: targetAux.groupScale,
                type: 'checkbox',
                visibility: [],
              },
              {
                id: 'groupScaleTypeH',
                customClass: 'group-scale-properties',
                title: propertiesPanelTrans.groupScaleTypeH,
                helpText: propertiesPanelTrans.groupScaleTypeHHelpText,
                value: targetAux.groupScaleTypeH,
                options: [
                  {
                    title: propertiesPanelTrans.groupScaleTypeOptions.left,
                    name: 'left',
                  },
                  {
                    title: propertiesPanelTrans.groupScaleTypeOptions.center,
                    name: 'center',
                  },
                  {
                    title: propertiesPanelTrans.groupScaleTypeOptions.right,
                    name: 'right',
                  },
                ],
                type: 'buttonSwitch',
                visibility: [
                  {
                    conditions: [
                      {
                        field: 'groupScale',
                        type: 'eq',
                        value: '0',
                      },
                    ],
                  },
                ],
              },
              {
                id: 'groupScaleTypeV',
                customClass: 'group-scale-properties',
                title: propertiesPanelTrans.groupScaleTypeV,
                helpText: propertiesPanelTrans.groupScaleTypeVHelpText,
                value: targetAux.groupScaleTypeV,
                options: [
                  {
                    title: propertiesPanelTrans.groupScaleTypeOptions.top,
                    name: 'top',
                  },
                  {
                    title: propertiesPanelTrans.groupScaleTypeOptions.middle,
                    name: 'middle',
                  },
                  {
                    title: propertiesPanelTrans.groupScaleTypeOptions.bottom,
                    name: 'bottom',
                  },
                ],
                type: 'buttonSwitch',
                visibility: [
                  {
                    conditions: [
                      {
                        field: 'groupScale',
                        type: 'eq',
                        value: '0',
                      },
                    ],
                  },
                ],
              },
            );
          }

          // Show slot if we the element isn't global
          // and in a group
          if (
            targetAux.elementType != 'global' &&
            (
              targetAux.groupId == '' ||
              targetAux.groupId == undefined
            )
          ) {
            commonFields.unshift(
              {
                id: 'pinSlot',
                title: propertiesPanelTrans.pinSlot,
                helpText: propertiesPanelTrans.pinSlotHelpText,
                customClass: 'element-slot-input',
                value: targetAux.pinSlot,
                type: 'checkbox',
                visibility: [],
              },
            );

            commonFields.unshift(
              {
                id: 'slot',
                title: propertiesPanelTrans.dataSlot,
                helpText: propertiesPanelTrans.dataSlotHelpText,
                customClass: 'element-slot-input',
                value: Number(targetAux.slot) + 1,
                min: minSlotValue,
                type: 'number',
                visibility: [],
              },
            );

            commonFields.unshift({
              id: 'effect',
              title: propertiesPanelTrans.effect,
              helpText: propertiesPanelTrans.effectHelpText,
              value: targetAux.effect,
              type: 'effectSelector',
              variant: 'showPaged noNone',
              visibility: [],
            });
          }

          forms.createFields(
            commonFields,
            self.DOMObject.find('#appearanceTab'),
            targetAux.elementId,
            null,
            null,
            'element-property element-common-property',
          );

          // Check if we have sendToElements properties from the widget
          // if so, we need to skip the element property
          const widgetProperties = res.data.module.properties;
          widgetProperties.forEach((wPpt) => {
            if (
              wPpt.sendToElements === true
            ) {
              properties.forEach((ePpt) => {
                ePpt.skip = (ePpt.id === wPpt.name);
              });
            }
          });

          // Create element fields
          forms.createFields(
            properties,
            self.DOMObject.find('#appearanceTab'),
            targetAux.elementId,
            null,
            targetAux.template.propertyGroups,
            'element-property',
          );

          // Add name field to advanced tab
          forms.createFields(
            [{
              id: 'elementName',
              title: propertiesPanelTrans.elementName,
              helpText: propertiesPanelTrans.elementNameHelpText,
              customClass: 'element-name-input',
              value: targetAux.elementName,
              type: 'text',
              visibility: [],
            }],
            self.DOMObject.find('#advancedTab'),
            targetAux.elementId,
            null,
            null,
            'element-property element-common-property',
            true, // Prepend
          );

          // Trigger save on name change
          self.DOMObject.find('[name="elementName"]')
            .on('change', function(ev, options) {
              if (!options?.skipSave) {
                // Update name for the group
                targetAux.elementName = $(ev.currentTarget).val();

                // Update layer manager
                app.viewer.layerManager.render();
              }
            });

          // Show the appearance tab
          // and select it if element isn't the only one on the widget
          // or it's a global element
          // and we don't have previous tab to be opened
          showAppearanceTab(
            (
              Object.values(target.elements).length > 1 ||
              target.subType === 'global'
            ) &&
            self.openTabOnRender == '',
          );

          // Also Init fields for the element
          self.initPanelFields(
            targetAux,
            res.data,
            true,
          );

          // Save element
          const saveElementProperty = function(target) {
            const $target = $(target);
            let containerChanged = false;
            // If the property is common, save it to the element
            if ($target.hasClass('element-common-property')) {
              // Get the property name
              const propertyName = $target.attr('name');

              // Get the value
              let value = $target.val();

              // If property is slot, set a value
              // with -1 to match with the array
              if (propertyName === 'slot') {
                // If value is lower than minSlotValue
                // set it to minSlotValue
                if (Number(value) < minSlotValue) {
                  value = minSlotValue;
                  $(target).val(minSlotValue);
                }

                value = Number(value) - 1;
              }

              // If property is pinSlot save it as boolean
              if (propertyName === 'pinSlot') {
                value = $target.is(':checked');
              }

              // Save group scale to element
              if (propertyName === 'groupScale') {
                value = $target.is(':checked');
              }

              // Set the property
              targetAux[propertyName] = value;

              // Set the container changed flag
              containerChanged = true;
            }

            // Save the element
            // only if we have form properties
            const formProperties = self.DOMObject.find(
              '[name].element-property:not(.element-common-property)' +
              ':not(.skip-save)',
            );
            if (formProperties.length > 0) {
              self.saveElement(
                targetAux,
                self.DOMObject.find(
                  '[name].element-property:not(.element-common-property)' +
                  ':not(.skip-save)',
                ),
                containerChanged,
              );
            }
          };

          const saveDebounced = _.wrap(
            _.memoize(
              () => _.debounce(
                saveElementProperty.bind(self), 250,
              ), _.property('id'),
            ),
            (getMemoizedFunc, obj) => getMemoizedFunc(obj)(obj),
          );

          // When we change the element fields, save them
          self.DOMObject.find(
            '[name].element-property:not(.skip-save)',
          ).on({
            change: function(_ev, options) {
              if (!options?.skipSave) {
                // Debounce save based on the object being saved
                saveDebounced(
                  _ev.currentTarget,
                );
              }
            },
            focus: function(_ev) {
              // Skip slot and widget name inputs
              // those are saved with elements
              if (
                $(_ev.currentTarget)
                  .parents(
                    '.xibo-form-input.element-slot-input,' +
                    '.xibo-form-input.element-name-input',
                  ).length === 0
              ) {
                self.toSaveElementCallback = function() {
                  saveElementProperty(_ev.currentTarget);
                };
              }
            },
          });
        });
      }

      // Show widget info
      self.showWidgetInfo(target);

      // If we're rendering an non-global element or group
      // mark it as active ( and remove others from active )
      if (
        (isElement || isElementGroup) &&
        target.subType != 'global' &&
        !target.activeTarget
      ) {
        // Get previous active widget
        const activeWidget = app.layout.canvas.getActiveWidgetOfType(
          target.subType,
          true,
          false,
        );

        // If we had previous active widget, mark is as inactive
        if (!$.isEmptyObject(activeWidget)) {
          activeWidget.activeTarget = false;
        }

        // Mark widget as active
        target.activeTarget = true;
      }
    }

    // If target is a widget, element, element-group or region
    // and we are in the Layout Editor
    // render position tab with region or element position
    if (
      app.mainObjectType === 'layout' &&
      (
        (
          target.type === 'widget' &&
          // Don't show for drawer widget
          target.drawerWidget != true
        ) ||
        target.type === 'region' ||
        isElementGroup
      )
    ) {
      const renderPositionTab = function() {
        // Get position
        let positionProperties = {};
        if (isElementGroup) {
          positionProperties = {
            type: 'element-group',
            top: Math.round(targetAux.top),
            left: Math.round(targetAux.left),
            width: Math.round(targetAux.width),
            height: Math.round(targetAux.height),
            zIndex: targetAux.layer,
          };
        } else if (targetAux?.type === 'element') {
          positionProperties = {
            type: 'element',
            top: Math.round(targetAux.top),
            left: Math.round(targetAux.left),
            width: Math.round(targetAux.width),
            height: Math.round(targetAux.height),
            zIndex: targetAux.layer,
          };

          if (targetAux.canRotate) {
            positionProperties.rotation = targetAux.rotation;
          }
        } else if (target.type === 'region') {
          // If we don't have target dimensions, stop rendering
          // position tab
          if (!target.dimensions) {
            return;
          }

          positionProperties = {
            type: 'region',
            regionType: target.subType,
            regionName: target.name,
            top: Math.round(target.dimensions.top),
            left: Math.round(target.dimensions.left),
            width: Math.round(target.dimensions.width),
            height: Math.round(target.dimensions.height),
            zIndex: target.zIndex,
          };
        } else {
          // If we don't have target dimensions, stop rendering
          // position tab
          if (!target.parent.dimensions) {
            return;
          }

          positionProperties = {
            type: 'region',
            regionType: target.parent.subType,
            regionName: target.parent.name,
            top: Math.round(target.parent.dimensions.top),
            left: Math.round(target.parent.dimensions.left),
            width: Math.round(target.parent.dimensions.width),
            height: Math.round(target.parent.dimensions.height),
            zIndex: target.parent.zIndex,
          };
        }

        // Get position template
        const positionTemplate = formTemplates.position;

        // Add position tab after advanced tab
        self.DOMObject.find(
          '[href="#advancedTab"], [href="#transitionTab"]',
        ).parent()
          .after(`<li class="nav-item">
            <a class="nav-link" href="#positionTab"
              data-toggle="tab">
              <i class="fas fa-border-none tooltip-always-on"
                data-toggle="tooltip"
                data-title="${propertiesPanelTrans.positioning}"></i>
            </a>
          </li>`);

        // Add position tab content after advanced tab content
        // If element is in a group, adjust position to the group's
        if (
          targetAux?.type == 'element' &&
          targetAux?.group != undefined
        ) {
          positionProperties.left -= targetAux.group.left;
          positionProperties.top -= targetAux.group.top;
        }

        // If it's an element, or element group, show canvas layer
        if (
          targetAux?.type == 'element' ||
          targetAux?.type == 'element-group'
        ) {
          positionProperties.zIndexCanvas = app.layout.canvas.zIndex;

          (targetAux?.type == 'element') &&
            (positionProperties.showElementLayer = true);

          (targetAux?.type == 'element-group') &&
            (positionProperties.showElementGroupLayer = true);
        }

        self.DOMObject.find('#advancedTab, #transitionTab').after(
          positionTemplate(
            Object.assign(positionProperties, {trans: propertiesPanelTrans}),
          ),
        );

        // Hide make fullscreen button for element groups
        if (isElementGroup) {
          self.DOMObject.find('#positionTab #setFullScreen').hide();
        }

        // Check if we should show the bring to view button
        const checkBringToView = function(pos) {
          const notInView = (
            pos.left > lD.layout.width ||
            (pos.left + pos.width) < 0 ||
            pos.top > lD.layout.height ||
            (pos.top + pos.height) < 0
          );
          self.DOMObject.find('#positionTab #bringToView')
            .toggleClass('d-none', !notInView);
        };
        checkBringToView(positionProperties);

        // If we change any input, update the target position
        self.DOMObject.find('#positionTab [name]').on(
          'change', _.debounce(function(ev) {
            const form = $(ev.currentTarget).parents('#positionTab');

            const preventNegative = function($field) {
              // Prevent layer to be negative
              let fieldValue = Number($field.val());
              if (fieldValue && fieldValue < 0) {
                fieldValue = 0;

                // Set form field back to 0
                $field.val(0);
              }

              // Return field value
              return fieldValue;
            };

            // If we changed the canvas layer, save only the canvas region
            if (
              $(ev.currentTarget).parents('.position-canvas-input').length > 0
            ) {
              const canvasZIndexVal = preventNegative(
                form.find('[name="zIndexCanvas"]'),
              );

              // Save canvas region
              app.layout.canvas.changeLayer(canvasZIndexVal);

              // Change layer for the viewer object
              app.viewer.DOMObject.find('.designer-region-canvas')
                .css('zIndex', canvasZIndexVal);

              // Update layer manager
              app.viewer.layerManager.render();

              // Don't save the rest of the form
              return;
            }

            const viewerScale = lD.viewer.containerObjectDimensions.scale;

            // Prevent layer to be negative
            const zIndexVal = preventNegative(
              form.find('[name="zIndex"]'),
            );

            if (targetAux == undefined) {
              // Widget
              const regionId = (target.type === 'region') ?
                target.id :
                target.parent.id;
              const positions = {
                width: form.find('[name="width"]').val(),
                height: form.find('[name="height"]').val(),
                top: form.find('[name="top"]').val(),
                left: form.find('[name="left"]').val(),
                zIndex: zIndexVal,
              };

              lD.layout.regions[regionId].transform(positions, true);

              // Check bring to view button
              checkBringToView(positions);

              lD.viewer.updateRegion(lD.layout.regions[regionId]);

              // Update moveable
              lD.viewer.updateMoveable();
            } else if (targetAux?.type == 'element') {
              // Element
              const $targetElement = $('#' + targetAux.elementId);

              // Move element
              $targetElement.css({
                width: form.find('[name="width"]').val() * viewerScale,
                height: form.find('[name="height"]').val() * viewerScale,
                top: form.find('[name="top"]').val() * viewerScale,
                left: form.find('[name="left"]').val() * viewerScale,
                zIndex: zIndexVal,
              });

              // Check bring to view button
              checkBringToView({
                width: form.find('[name="width"]').val(),
                height: form.find('[name="height"]').val(),
                top: form.find('[name="top"]').val(),
                left: form.find('[name="left"]').val(),
              });

              // Rotate element
              if (form.find('[name="rotation"]').val() != undefined) {
                $targetElement.css('transform', 'rotate(' +
                  form.find('[name="rotation"]').val() +
                  'deg)');
                lD.viewer.moveable.updateRect();
              }

              // Save layer
              targetAux.layer = zIndexVal;

              // Recalculate group dimensions
              if (targetAux.groupId) {
                lD.viewer.saveElementGroupProperties(
                  lD.viewer.DOMObject.find('#' + targetAux.groupId),
                  true,
                  false,
                );
              } else {
                // Save properties
                lD.viewer.saveElementProperties($targetElement, true);
              }

              // Update element
              lD.viewer.updateElement(targetAux, true);

              // Update moveable
              lD.viewer.updateMoveable();
            } else if (targetAux?.type == 'element-group') {
              // Element group
              const $targetElementGroup = $('#' + targetAux.id);

              // Move element group
              $targetElementGroup.css({
                width: form.find('[name="width"]').val() * viewerScale,
                height: form.find('[name="height"]').val() * viewerScale,
                top: form.find('[name="top"]').val() * viewerScale,
                left: form.find('[name="left"]').val() * viewerScale,
                zIndex: zIndexVal,
              });

              // Save layer
              targetAux.layer = zIndexVal;

              // Check bring to view button
              checkBringToView({
                width: form.find('[name="width"]').val(),
                height: form.find('[name="height"]').val(),
                top: form.find('[name="top"]').val(),
                left: form.find('[name="left"]').val(),
              });

              // Scale group
              // Update element dimension properties
              targetAux.transform({
                width: parseFloat(
                  form.find('[name="width"]').val(),
                ),
                height: parseFloat(
                  form.find('[name="height"]').val(),
                ),
              }, false);
              lD.viewer.updateElementGroup(targetAux);

              // Save properties
              lD.viewer.saveElementGroupProperties(
                $targetElementGroup,
                true,
                true,
              );

              // Update moveable
              lD.viewer.updateMoveable();
            }

            // Update layer manager
            app.viewer.layerManager.render();
          }, 200));

        // Handle set fullscreen button
        self.DOMObject.find('#positionTab #setFullScreen').off().on(
          'click',
          function(ev) {
            const form = $(ev.currentTarget).parents('#positionTab');
            const viewerScale = lD.viewer.containerObjectDimensions.scale;

            if (targetAux == undefined) {
              // Widget or region
              const regionId = (target.type === 'region') ?
                target.id : target.parent.id;

              lD.layout.regions[regionId].transform({
                width: lD.layout.width,
                height: lD.layout.height,
                top: 0,
                left: 0,
              }, true);

              lD.viewer.updateRegion(lD.layout.regions[regionId], true);
            } else if (targetAux?.type == 'element') {
              // Element
              const $targetElement = $('#' + targetAux.elementId);

              // Move element
              $targetElement.css({
                width: lD.layout.width * viewerScale,
                height: lD.layout.height * viewerScale,
                top: 0,
                left: 0,
              });

              // Save properties
              lD.viewer.saveElementProperties($targetElement, true);

              // Update element
              lD.viewer.updateElement(targetAux, true);
            }

            // Change position tab values
            form.find('[name="width"]').val(lD.layout.width);
            form.find('[name="height"]').val(lD.layout.height);
            form.find('[name="top"]').val(0);
            form.find('[name="left"]').val(0);

            // Check bring to view button
            checkBringToView({
              width: lD.layout.width,
              height: lD.layout.height,
              top: 0,
              left: 0,
            });

            // Update moveable
            lD.viewer.updateMoveable();
          });

        // Handle bring to view button
        self.DOMObject.find('#positionTab #bringToView').off().on(
          'click',
          function(ev) {
            const form = $(ev.currentTarget).parents('#positionTab');
            const viewerScale = lD.viewer.containerObjectDimensions.scale;

            // Get position to fix the item being outside of the layout
            const calculateNewPosition = function(positions) {
              if (Number(positions.left) > app.layout.width) {
                positions.left = app.layout.width - positions.width;
              }
              if (Number(positions.left) + positions.width < 0) {
                positions.left = 0;
              }
              if (Number(positions.top) > app.layout.height) {
                positions.top = app.layout.height - positions.height;
              }
              if (Number(positions.top) + Number(positions.height) < 0) {
                positions.top = 0;
              }
              return positions;
            };

            let newPosition = {};

            if (targetAux == undefined) {
              // Widget
              const regionId = (target.type === 'region') ?
                target.id :
                target.parent.id;

              newPosition =
                calculateNewPosition(lD.layout.regions[regionId].dimensions);

              lD.layout.regions[regionId].transform(
                newPosition,
                true,
              );

              lD.viewer.updateRegion(lD.layout.regions[regionId], true);
            } else if (targetAux?.type == 'element') {
              // Element
              const $targetElement = $('#' + targetAux.elementId);

              newPosition =
                calculateNewPosition({
                  width: targetAux.width,
                  height: targetAux.height,
                  top: targetAux.top,
                  left: targetAux.left,
                });

              // Move element
              $targetElement.css({
                width: newPosition.width * viewerScale,
                height: newPosition.height * viewerScale,
                top: newPosition.top * viewerScale,
                left: newPosition.left * viewerScale,
              });

              // Save properties
              lD.viewer.saveElementProperties($targetElement, true);

              // Update element
              lD.viewer.updateElement(targetAux, true);
            } else if (targetAux?.type == 'element-group') {
              const $targetElementGroup = $('#' + targetAux.id);

              newPosition =
                calculateNewPosition({
                  width: targetAux.width,
                  height: targetAux.height,
                  top: targetAux.top,
                  left: targetAux.left,
                });

              // Move element group
              $targetElementGroup.css({
                width: newPosition.width * viewerScale,
                height: newPosition.height * viewerScale,
                top: newPosition.top * viewerScale,
                left: newPosition.left * viewerScale,
              });

              // Scale group
              // Update element dimension properties
              targetAux.transform({
                width: newPosition.width,
                height: newPosition.height,
                top: newPosition.top,
                left: newPosition.left,
              });

              // Save properties
              lD.viewer.saveElementGroupProperties(
                $targetElementGroup,
                true,
                true,
              );

              // Update moveable
              lD.viewer.updateMoveable();
            }

            // Change position tab values
            form.find('[name="width"]').val(newPosition.width);
            form.find('[name="height"]').val(newPosition.height);
            form.find('[name="top"]').val(newPosition.top);
            form.find('[name="left"]').val(newPosition.left);

            // Update moveable
            lD.viewer.updateMoveable();

            // Update layer manager
            lD.viewer.layerManager.render();
          });

        // Check if we have group scale properties for elements
        // and move them to the top of the position tab
        self.DOMObject.find('#appearanceTab .group-scale-properties')
          .prependTo(self.DOMObject.find('#positionTab'));
      };

      // If it's an element, get properties, first to update it
      // and only then call render position tab
      if (targetAux?.type === 'element') {
        targetAux.getProperties().then(function() {
          renderPositionTab();

          // Handle replacements for element
          const data = {
            layout: app.layout,
          };
          forms.handleFormReplacements(self.DOMObject.find('form'), data);
        });
      } else {
        renderPositionTab();
      }
    }

    // For media widget, add replacement button
    if (
      target.type === 'widget' &&
      res.data.module.regionSpecific === 0 &&
      res.data.media && res.data.mediaEditable === true
    ) {
      const $form = self.DOMObject.find('form');

      // Get valid extensions from moduleList
      const validExtensions = modulesList.find((module) => {
        return module.moduleId == res.data.module.moduleId;
      }).validExtensions;

      // Add data to form so it can be used in mediaEditFormOpen
      $form.data({
        mediaId: res.data.media.mediaId,
        mediaEditable: res.data.mediaEditable,
        widgetId: target.widgetId,
        validExtensions: validExtensions.replaceAll(',', '|'),
      });

      // Call media form open method
      formHelpers.mediaEditFormOpen(self.DOMObject);
    }

    // Show fallback tab if widget has datatype
    const showFallbackData = (target.type === 'widget') ?
      target.checkShowFallbackData() :
      false;

    if (showFallbackData) {
      // Show fallback tab
      self.DOMObject.find('.nav-link[href="#fallbackTab"]')
        .parent().removeClass('d-none');

      // Reload widget
      const reloadWidget = function() {
        // Reload if we're editing on the layout editor
        if (app.mainObjectType === 'layout') {
          lD.reloadData(lD.layout, {
            refreshEditor: false,
          }).then(() => {
            // Stop if not available
            if (Object.keys(self).length === 0) {
              return;
            }

            // If we're selecting an element or group
            // Render all elements from the current widget/target
            if (isElement || isElementGroup) {
              // If we're saving an element, reload all elements
              // from the widget that the element is in
              for (element in target.elements) {
                if (
                  Object.prototype.hasOwnProperty
                    .call(target.elements, element)
                ) {
                  app.viewer.renderElementContent(target.elements[element]);
                }
              }
            } else {
              const mainObject =
                app.getObjectByTypeAndId(app.mainObjectType, app.mainObjectId);

              // Reload only for the current widget/target
              app.reloadData(
                mainObject,
                {
                  reloadPropertiesPanel: false,
                },
              ).then(() => {
                if (!target.drawerWidget) {
                  app.viewer.renderRegion(
                    app.getObjectByTypeAndId('region', target.regionId),
                  );
                } else {
                  app.viewer.renderRegion(
                    app.layout.drawer,
                    target,
                  );
                }
              });
            }
          });
        }
      };

      // Get datatype
      target.getDataType().then((dt) => {
        // Get data before creating form
        target.getFallbackData().then((fbd) => {
          // Create form
          forms.createFallbackDataForm(
            dt,
            self.DOMObject.find('#fallbackTab'),
            fbd,
            target,
            reloadWidget,
          );
        });
      });
    }

    // Init fields ( for non elements )
    (!isElement) &&
      self.initPanelFields(target, res.data, false);

    // Save loading form state to restore later
    if (saveInitFormState) {
      const $form = self.DOMObject.find('form');
      const serializedInputs = $form.find('[name]')
        .filter('.tab-pane:not(#positionTab) [name]').serialize();
      $form.data('initFormState', serializedInputs);
    }
  }).fail(function(data) {
    // Clear request var after response
    self.renderRequest = undefined;

    if (data.statusText != 'requestAborted') {
      toastr.error(errorMessagesTrans.getFormFailed, errorMessagesTrans.error);
    }
  });
};

/**
 * Initialise the form fields
 * @param {*} target The target object
 * @param {*} data The data to be used
 * @param {boolean} elementProperties - render element properties
 */
PropertiesPanel.prototype.initPanelFields = function(
  target,
  data,
  elementProperties = false,
) {
  const self = this;
  const app = this.parent;
  const targetIsElement = (target.type === 'element');
  const targetIsPlaylist =
    (target.type === 'region' && target.subType === 'playlist');
  const readOnlyModeOn =
    (typeof (lD) != 'undefined' && lD?.readOnlyMode === true) ||
    (app?.readOnlyMode === true);

  // If layout ( or playlist ) isn't added to data
  // add it for the translation replacements
  if (data.layout === undefined && app.mainObjectType === 'layout') {
    data.layout = app.layout;
  } else if (data.playlist === undefined && app.mainObjectType === 'playlist') {
    data.playlist = app.playlist;
  }

  // Set condition and handle replacements
  forms.handleFormReplacements(self.DOMObject.find('form'), data);
  forms.setConditions(
    self.DOMObject.find('form'),
    data,
    (elementProperties) ?
      target.elementId :
      (target.type === 'region' ? target.regionId : target.widgetId),
    (target.parent && target.parent.isTopLevel != undefined) ?
      target.parent.isTopLevel : true,
  );

  // Run form open module optional function
  if (target.type === 'widget') {
    // Pass widget options to the form as data
    if (target.getOptions != undefined) {
      self.DOMObject.find('form').data(
        'elementOptions',
        target.getOptions(),
      );
    }

    formHelpers.widgetFormEditAfterOpen(self.DOMObject, target.subType);
  } else if (
    target.type === 'region' &&
    typeof window.regionFormEditOpen === 'function'
  ) {
    window.regionFormEditOpen.bind(self.DOMObject)();
  }

  // Save tab when changing
  self.DOMObject.on('click', '.nav-tabs .nav-link', function(ev) {
    // Save previous tab for elements
    self.openTabOnRender =
      'a[href="' + $(ev.currentTarget).attr('href') + '"]';
  });

  // Check for spacing issues on text fields
  forms.checkForSpacingIssues(self.DOMObject);

  // Save form data if not a element
  // and avoid saving element specific inputs
  if (!targetIsElement) {
    // Reset saved data
    self.formSerializedLoadData = {
      layout: '',
      region: '',
      widget: '',
      position: '',
    };

    // Save for this type
    let $fields = self.DOMObject.find('form [name]:not(.element-property)');
    // Filter position tab if needed
    $fields = (targetIsPlaylist) ?
      $fields : $fields.filter('.tab-pane:not(#positionTab) [name]');
    self.formSerializedLoadData[target.type] = $fields.serialize();

    // If widget, also save position form
    if (target.type === 'widget') {
      self.formSerializedLoadData.position =
        self.DOMObject.find('form #positionTab [name]')
          .serialize();
    }
  }

  // If we're not in read only mode
  if (!readOnlyModeOn) {
    // Handle buttons
    self.DOMObject.find('.properties-panel-btn:not(.inline-btn)')
      .off().on('click', function(e) {
        if ($(e.target).data('action')) {
          self[$(e.target).data('action')](
            target,
            $(e.target).data('subAction'),
          );
        }
      });
  }

  // Xibo Init options
  let xiboInitOptions = null;
  if (target.type == 'widget') {
    xiboInitOptions = {
      targetId: target.widgetId,
    };
  } else if (elementProperties) {
    xiboInitOptions = {
      targetId: target.elementId,
      elementProperties: true,
    };
  }

  // Read only mode option
  if (readOnlyModeOn) {
    (!xiboInitOptions) && (xiboInitOptions = {});

    xiboInitOptions.readOnlyMode = true;
  }

  // Handle image replace droppable area
  const replaceImageInElement = function(element, card) {
    const fromProvider = $(card).hasClass('from-provider');

    // Replace in element, save and reload
    const replaceInElement = function(mediaId, mediaName) {
      element.replaceMedia(mediaId, mediaName).then(() => {
        self.parent.viewer.renderElementContent(element);
      });
    };

    // Import from provider or add from library
    if (fromProvider) {
      lD.importFromProvider(
        [$(card).data('providerData')],
      ).then((res) => {
        // If res is empty, it means that the import failed
        if (res.length === 0) {
          console.error('Replace from provider failed!');
        } else {
          replaceInElement(res[0]);
        }
      });
    } else {
      replaceInElement(
        $(card).data('mediaId'),
        $(card).data('title'),
      );
    }
  };

  self.DOMObject.find('.image-replace-control-area').droppable({
    greedy: true,
    tolerance: 'pointer',
    accept: function(el) {
      return (
        $(el).data('type') === 'media' &&
        $(el).data('subType') === 'image'
      );
    },
    drop: _.debounce(function(event, ui) {
      replaceImageInElement(self.parent.selectedObject, ui.draggable);
    }, 200),
  });

  self.DOMObject.find('.image-replace-control-area')
    .on('click', function(event) {
      if ($(event.currentTarget).hasClass('ui-droppable-active')) {
        replaceImageInElement(
          self.parent.selectedObject,
          self.parent.toolbar.selectedCard,
        );

        self.parent.toolbar.deselectCardsAndDropZones();
      }
    });

  // Call Xibo Init for this form
  XiboInitialise(
    '#' + self.DOMObject.attr('id'),
    xiboInitOptions,
  );

  // For the layout properties, call background Setup
  // TODO Move method to a common JS file
  if (target.type == 'layout') {
    backGroundFormSetup(self.DOMObject);
  }

  // Make form read only
  if (readOnlyModeOn) {
    forms.makeFormReadOnly(self.DOMObject);
  }

  // if a tab was previously selected, select it again
  if (self.openTabOnRender != '') {
    // Show tab
    self.showTab(self.openTabOnRender, false);
  }

  // Initialise tooltips
  app.common.reloadTooltips(
    self.DOMObject,
    {
      position: 'left',
    },
  );

  // Handle Auto Save
  // (only when working in the layout editor)
  // and if not using the interactive add widget mode
  if (
    !readOnlyModeOn &&
    (
      self.parent.mainObjectType == 'layout' ||
      (
        self.parent.mainObjectType == 'playlist' &&
        self.parent.inline === true
      )
    )
  ) {
    const saveDebounced = _.wrap(
      _.memoize(
        () => _.debounce(self.save.bind(self), 500), _.property('id'),
      ),
      (getMemoizedFunc, obj) => getMemoizedFunc(obj)(obj),
    );

    const skipSave = function(target, event) {
      // If field is code input
      // only save when the event is a change/onfocus
      if (
        $(target).hasClass('code-input') &&
        event.type === 'inputChange'
      ) {
        return true;
      }

      // If field is canvas layer, skip
      if (
        $(target).is('[name="zIndexCanvas"]')
      ) {
        return true;
      }

      // For rich text, check if CKEditor has changed
      if ($(target).hasClass('rich-text')) {
        const ckEditorInstance =
          formHelpers.getCKEditorInstance($(target).attr('id'));

        if (ckEditorInstance) {
          const initialValue =
            $(ckEditorInstance.sourceElement).data('initialValue');

          // If value is the same as initial, skip
          if (
            initialValue === ckEditorInstance.getData()
          ) {
            return true;
          }
        }
      }

      return false;
    };

    // Auto save when changing inputs
    const skipXiboFormInput =
      ':not(.position-input):not(.action-form-input)' +
      ':not(.snippet-selector):not(.element-slot-input)' +
      ':not(.fallback-property)' +
      ':not(.ticker-tag-style-property)' +
      ':not(.canvas-widget-control-dropdown)';
    const skipFormInput =
      ':not(.element-property)' +
      ':not(.element-group-property)' +
      ':not([data-tag-style-input])';
    $(self.DOMObject).find('form').off()
      .on(
        {
          'change blur inputChange xiboInputChange': function(_ev, options) {
            // Check if we skip this field
            if (skipSave(_ev.currentTarget, _ev)) {
              return;
            }

            // Debounce save based on the object being saved
            if (!options?.skipSave) {
              saveDebounced(
                self.parent.selectedObject,
              );
            }
          },
          'focus editorFocus': function(_ev) {
            // Check if we dont skip this field
            self.toSave = !skipSave(_ev.currentTarget, _ev);
          },
        },
        `.xibo-form-input${skipXiboFormInput} select${skipFormInput}, ` +
        `.xibo-form-input${skipXiboFormInput} input${skipFormInput}, ` +
        `.xibo-form-input${skipXiboFormInput} textarea${skipFormInput}, ` +
        '[name="backgroundImageId"] ',
      );
  }
};

/**
 * Save Region
 * @param {Boolean} savePositionForm - if we want to save only the position form
 * @return {boolean} false if unsuccessful
 */
PropertiesPanel.prototype.saveRegion = function(
  savePositionForm = false,
) {
  const app = this.parent;
  const self = this;
  const form = (savePositionForm) ?
    $(this.DOMObject).find('form #positionTab [name]') :
    $(self.DOMObject).find('form');

  // If form not loaded, prevent changes
  if (form.length == 0) {
    return false;
  }

  const region = (
    savePositionForm &&
    app.selectedObject.type != 'region'
  ) ?
    app.selectedObject.parent :
    app.selectedObject;
  const formNewData = form.serialize();
  const requestPath =
    urlsForApi.region.saveForm.url.replace(':id', region[region.type + 'Id']);

  const formOldData = (savePositionForm) ?
    self.formSerializedLoadData.position :
    self.formSerializedLoadData[app.selectedObject.type];

  // If form is valid, and it changed, submit it ( add change )
  if (form.valid() && formOldData != formNewData) {
    // Add a save form change to the history array
    // with previous form state and the new state
    app.historyManager.addChange(
      'saveForm',
      region.type, // targetType
      region[region.type + 'Id'], // targetId
      formOldData, // oldValues
      formNewData, // newValues
      {
        customRequestPath: {
          url: requestPath,
          type: urlsForApi.region.saveForm.type,
        },
        upload: true, // options.upload
        targetSubType: region.subType,
      },
    ).then((res) => { // Success
      // Clear error message
      formHelpers.clearErrorMessage(form);

      // Update saved form data
      self.formSerializedLoadData[app.selectedObject.type] = formNewData;
    }).catch((error) => { // Fail/error
      // Show error returned or custom message to the user
      let errorMessage = '';

      if (typeof error == 'string') {
        errorMessage += error;
      } else {
        errorMessage += error.errorThrown;
      }
      // Remove added change from the history manager
      app.historyManager.removeLastChange();

      // Display message in form
      formHelpers.displayErrorMessage(form, errorMessage, 'danger');
    });
  }
};

/**
 * Render actions
 * @param {object} object
 */
PropertiesPanel.prototype.renderActions = function(
  object,
) {
  const self = this;
  const app = this.parent;

  // If it isn't set, use selected object
  if (!object) {
    object = app.selectedObject;
  }

  // Init drawer
  app.initDrawer();

  const propertiesPanelOptions = {
    style: 'actions',
    form: actionsFormContentTemplate({
      objectType: object.type,
      trans: propertiesPanelTrans.actions,
      readOnly: app.readOnlyMode,
    }),
    trans: propertiesPanelTrans,
  };

  // Create Actions form content and attach to DOM
  self.DOMObject.html(propertiesPanelTemplate(propertiesPanelOptions));

  // Get actions and populate form containers
  app.actionManager.getAllActions(app.mainObjectId)
    .then(function(data) {
      if (
        !$.isEmptyObject(data)
      ) {
        Object.entries(data).forEach(([_id, action]) => {
          self.createPreviewAction(
            action,
          );
        });
      }
    });

  // Add action button handling
  self.DOMObject.find('.actions-content button[data-action="add"]')
    .on('click', function() {
      const $trigger = app.viewer.DOMObject.find('.selected-action-trigger');
      const actionData = {};

      // If it's an element group
      if ($trigger.hasClass('group-select-overlay')) {
        const $elGroup = $trigger.parents('.designer-element-group');
        actionData.source = $elGroup.data('type');
        actionData.sourceId = $elGroup.attr('id');
      } else if ($trigger.hasClass('designer-element')) {
        actionData.source = $trigger.data('type');
        actionData.sourceId = $trigger.attr('id');
      } else {
        actionData.source = $trigger.data('type');
        actionData.sourceId = $trigger.data(actionData.source + 'Id');
      }

      actionData.newAction = true;

      // Remove active status from trigger
      app.viewer.DOMObject.find('.selected-action-trigger')
        .removeClass('selected-action-trigger trigger-hovering')
        .find('.trigger-add-button').remove();
      app.viewer.DOMObject.find('.selected-action-trigger-parent')
        .removeClass('selected-action-trigger-parent');

      self.createEditAction(actionData, null);
    });

  // Handle hover to highlight action on viewer
  self.DOMObject.find('.actions-list').on(
    'mouseenter',
    '.action-view',
    function(ev) {
      const actionId = $(ev.currentTarget).data('actionId');
      app.viewer.highlightAction(actionId);
    },
  );

  self.DOMObject.find('.actions-list').on(
    'mouseleave',
    '.action-view',
    function(ev) {
      app.viewer.highlightAction();
    },
  );

  // If we were editing an action, open it
  if (!$.isEmptyObject(app.actionManager.editing)) {
    self.createEditAction(app.actionManager.editing);
  }
};

/**
 * Add new action editform
 * @param {object} actionData
 * @param {object} $target - Target container to be replaced
 * @param {object/boolean=} [options.actionNeedsValidateToCancel = false]
 * @return {boolean} false if unsuccessful
 */
PropertiesPanel.prototype.createEditAction = function(
  actionData = {},
  $target = null,
  {
    actionNeedsValidateToCancel = false,
  } = {},
) {
  const self = this;
  const app = self.parent;
  const actionManager = app.actionManager;
  const $actionsContent = self.DOMObject.find('.actions-content');
  const $actionsList = self.DOMObject.find('.actions-list');

  // Send the layout code search URL with the action
  actionData.layoutCodeSearchURL = urlsForApi.layout.codeSearch.url;

  // Add action types
  actionData.actionTypeOptions = Object.keys(actionTypesAndRules)
    .map((action) => {
      // Set action type helper
      if (
        actionData.actionType != undefined &&
        (
          actionTypesAndRules[action].subTypeFixed === actionData.actionType ||
          actionTypesAndRules[action].targetType === actionData.target &&
          actionTypesAndRules[action].subType === actionData.actionType
        )
      ) {
        actionData.actionTypeHelper = action;
      }

      return {
        name: action,
        title: propertiesPanelTrans.actions[action],
      };
    });

  // Get widget name if exists
  if (actionData.widgetId) {
    actionData.widgetName =
      app.getObjectName('drawerWidget', actionData.widgetId);
  }

  // Create action and add to container
  const $newActionContainer =
    $(actionFormActionEditTemplate($.extend({}, actionData, {
      trans: propertiesPanelTrans.actions,
    })));

  // Add action id to container
  $newActionContainer.attr('data-action-id', actionData.actionId);

  // Add action to container
  // or replace target
  ($target) ?
    $target.replaceWith($newActionContainer) :
    $newActionContainer.prependTo($actionsList);

  // Populate dropdowns with layout elements
  app.populateDropdownWithLayoutElements(
    $newActionContainer.find('[name="sourceId"]'),
    {
      typeInput: 'source',
      value: actionData.sourceId,
      filters: [
        'layouts',
        'regions',
        'playlists',
        'widgets',
      ],
    },
  );

  const updateActionDataObj = function() {
    const actionType =
      $newActionContainer.find('[name="actionTypeHelper"]').val();
    const source = $newActionContainer.find('[name="source"]').val();
    const sourceId = $newActionContainer.find('[name="sourceId"]').val();
    const target = $newActionContainer.find('[name="target"]').val();
    const targetId = $newActionContainer.find('[name="targetId"]').val();
    const layoutCode = $newActionContainer.find('[name="layoutCode"]').val();
    const widgetId = $newActionContainer.find('[name="widgetId"]').val();
    const triggerCode = $newActionContainer.find('[name="triggerCode"]').val();
    const triggerType = $newActionContainer.find('[name="triggerType"]').val();

    // Update local action data
    actionData.actionType = actionType;
    actionData.source = source;
    actionData.sourceId = sourceId;
    actionData.target = target;
    actionData.targetId = targetId;
    actionData.layoutCode = layoutCode;
    actionData.widgetId = widgetId;
    actionData.triggerCode = triggerCode;
    actionData.triggerType = triggerType;

    // Update action manager side
    app.actionManager.editing = actionData;
  };

  const updateActionType = function(actionType, updateTargetDropdown = true) {
    // If no action type is defined, skip
    if (!actionType) {
      return;
    }

    const subType = actionTypesAndRules[actionType].subType ||
      actionTypesAndRules[actionType].subTypeFixed;
    const targetType = actionTypesAndRules[actionType].targetType;
    const targetTypeFilters = actionTypesAndRules[actionType].targetTypeFilter;
    const targetId = $newActionContainer.find('[name="targetId"]').val();

    // Update hidden field
    if (subType) {
      $newActionContainer.find('[name="actionType"]').val(subType);
    }

    // If navigate to layout, or target type is screen
    // target is current layout
    // and hide the controller
    if (actionType == 'navLayout' || targetType === 'screen') {
      $newActionContainer.find('.action-edit-form-target').hide();
      actionData.targetId = app.layout.layoutId;
    } else {
      $newActionContainer.find('.action-edit-form-target').show();
    }

    // Handle navigate to widget
    if (actionType == 'navWidget' && targetId) {
      // Show navWidget controls
      $newActionContainer.find('.action-target-widget-component').show();
      if (actionData.widgetId) {
        const $dropdownBtn = $newActionContainer
          .find('.action-target-widget-dropdown-button');
        function toggleDropdown() {
          $dropdownBtn.find('.action-target-widget-dropdown-container')
            .toggleClass('active');
        }

        $dropdownBtn
          .on('click', function(e) {
            toggleDropdown();
            app.editorContainer.on('click.dismiss', function(e2) {
              if (
                !$(e2.target)
                  .hasClass('action-target-widget-dropdown-button') &&
                $(e2.target).parents('.action-target-widget-dropdown-button')
                  .length === 0
              ) {
                app.editorContainer.off('click.dismiss');
                toggleDropdown();
              }
            });
          });
        // Handle edit and delete buttons
        $newActionContainer
          .find('.action-edit-widget-btn[data-action="edit-widget"]')
          .on('click', function(e) {
            app.toggleInteractiveEditWidgetMode(
              true,
              actionData,
              {
                adding: false,
              },
            );
          });
        $newActionContainer
          .find('.action-edit-widget-btn[data-action="delete-widget"]')
          .on('click', function(e) {
            // Deselect object first
            app.selectObject();
            app.layout.deleteObject('widget', actionData.widgetId).then(() => {
              actionData.widgetId = null;
              app.reloadData(app.layout, {
                refreshEditor: false,
              }).then(() => {
                self.createEditAction(actionData, $newActionContainer, {
                  actionNeedsValidateToCancel: true,
                });
              });
            });
          });
      } else {
        // Handle create widget button
        $newActionContainer
          .find('.action-edit-widget-btn[data-action="add-widget"]')
          .on('click', function(e) {
            app.toggleInteractiveEditWidgetMode(
              true,
              actionData,
              {
                adding: true,
              },
            );
          });
      }
    } else {
      // Hide navWidget controls
      $newActionContainer.find('.action-target-widget-component').hide();
    }

    if (updateTargetDropdown) {
      app.populateDropdownWithLayoutElements(
        $newActionContainer.find('[name="targetId"]'),
        {
          typeInput: 'target',
          value: actionData.targetId,
          filters: targetTypeFilters,
        },
      );
    }

    updateActionDataObj();
  };

  // Handle action type change
  const $actionTypeHelperInput =
    $newActionContainer.find('[name="actionTypeHelper"]');
  $actionTypeHelperInput.on('change', function(e) {
    const actionType = $(e.currentTarget).val();
    updateActionType(actionType);
  });

  // Update type value
  const updateTypeValue = function($target) {
    const typeInput = $target.data('type-input');
    const $typeInput = self.DOMObject.find(`[name="${typeInput}"]`);

    // If there's no typeInput, stop
    if (
      !typeInput &&
      $typeInput.length === 0
    ) {
      return;
    }

    let typeInputValue = $target.find(':selected').data('type');

    // For target, if target is layout, change it to screen
    if ($typeInput.attr('id') === 'input_target' &&
      typeInputValue === 'layout'
    ) {
      typeInputValue = 'screen';
    }

    // Update type value
    $typeInput.val(typeInputValue);

    updateActionType($actionTypeHelperInput.val(), false);
    updateActionDataObj();
  };

  // Handle trigger and target change
  $newActionContainer
    .find('[name="sourceId"], [name="targetId"], [name="layoutCode"]')
    .on('change', function(e) {
      updateTypeValue($(e.currentTarget));

      const actionType =
        $newActionContainer.find('[name="actionTypeHelper"]').val();
      const source = $newActionContainer.find('[name="source"]').val();
      const sourceId = $newActionContainer.find('[name="sourceId"]').val();
      const target = $newActionContainer.find('[name="target"]').val();
      const targetId = $newActionContainer.find('[name="targetId"]').val();
      const layoutCode = $newActionContainer.find('[name="layoutCode"]').val();

      app.viewer.updateActionLineTargets(
        (actionData.actionId) ? actionData.actionId : 'action_line_temp',
        {
          type: source,
          id: sourceId,
        },
        {
          type: (actionType != 'navLayout') ? target : 'screen',
          id: (actionType != 'navLayout') ? targetId : layoutCode,
        },
        (actionType === 'navLayout'), // targetIsDockRecent?
      );
    });

  // Handle buttons
  $newActionContainer.find('.action-btn').on('click', function(e) {
    const btnAction = $(e.currentTarget).data('action');

    if (btnAction === 'save') {
      // Save action
      self.saveAction($newActionContainer);
    } else if (btnAction === 'delete') {
      actionManager.deleteAction(
        actionData,
      ).then((wasRemoved) => {
        if (wasRemoved) {
          // Remove widget from drawer if action has widgetId
          if (actionData.widgetId) {
            app.layout.deleteObject('widget', actionData.widgetId);
          }

          // Remove action line
          app.viewer.removeActionLine($newActionContainer.data('actionId'));

          // Remove edit status
          // $actionsContent.removeClass('editing-action');
          app.actionManager.editing = {};
          self.renderActions();

          // Update all other action lines
          app.viewer.updateActionLine();
        }
      });
    } else if (btnAction === 'close') {
      const editingAction = app.actionManager.editing;

      if (actionNeedsValidateToCancel) {
        self.saveAction($newActionContainer);
      } else {
        // If action started without widget created
        // and there's a widget Id, delete it
        if (editingAction.startedWithNoWidget && editingAction.widgetId) {
          app.layout.deleteObject('widget', editingAction.widgetId);
        }

        // Close action
        self.closeEditAction($newActionContainer);
      }
    }
  });

  // Set actionData to container
  $newActionContainer.data(actionData);

  // Add editing status
  app.actionManager.editing = actionData;
  $actionsContent.addClass('editing-action');

  // Check if we are in a new action
  // with no widget id and save state
  if (actionData.newAction && actionData.widgetId == null) {
    app.actionManager.editing.startedWithNoWidget = true;
  }

  // Form conditions
  forms.setConditions($newActionContainer, null, 'actions');

  // Initialise tooltips
  app.common.reloadTooltips(
    $newActionContainer,
    {
      position: 'left',
    },
  );

  // Update action lines
  app.viewer.updateActionLine();

  // Update action type on start
  updateActionType($actionTypeHelperInput.val());

  // Run xiboInitialise on form
  XiboInitialise('.action-edit-form');
};

/**
 * Add new action preview
 * @param {object} actionData
 * @param {object} $target - Target container to be replaced
 * @return {boolean} false if unsuccessful
 */
PropertiesPanel.prototype.createPreviewAction = function(
  actionData = {},
  $target,
) {
  const self = this;
  const app = self.parent;
  const actionManager = app.actionManager;
  const $actionsList =
    self.DOMObject.find('.actions-list');

  // Send the layout code search URL with the action
  actionData.layoutCodeSearchURL = urlsForApi.layout.codeSearch.url;

  // Set action type name as actionType by default
  actionData.actionTypeName = actionData.actionType;

  // Add action types
  actionData.actionTypeOptions = Object.keys(actionTypesAndRules)
    .map((action) => {
      // For actions like next and previous
      // get the real name for translation purposes
      if (
        (
          actionData.actionType === 'next' ||
          actionData.actionType === 'previous'
        ) && actionTypesAndRules[action].subType === actionData.actionType &&
        actionTypesAndRules[action].targetType === actionData.target
      ) {
        actionData.actionTypeName = action;
      }

      return {
        name: action,
        title: propertiesPanelTrans.actions[action],
      };
    });

  // Get names for trigger, target and widgetId
  if (actionData.sourceId) {
    actionData.sourceName =
      app.getObjectName(actionData.source, actionData.sourceId);
  }

  if (actionData.targetId) {
    actionData.targetName =
      app.getObjectName(actionData.target, actionData.targetId);
  }

  if (actionData.widgetId) {
    actionData.widgetName =
      app.getObjectName('drawerWidget', actionData.widgetId);
  }

  // Create action and add to container
  const $actionContainer =
    $(actionFormActionViewTemplate($.extend({}, actionData, {
      showTarget: !(
        actionData.actionTypeName === 'navLayout' ||
        actionData.actionTypeName === 'nextLayout' ||
        actionData.actionTypeName === 'previousLayout'
      ),
      trans: propertiesPanelTrans.actions,
      readOnly: app.readOnlyMode,
    })));

  // Add action id to container
  $actionContainer.attr('data-action-id', actionData.actionId);

  // Check if action was already added
  $target = (!$target) ?
    $actionsList.find(
      '.action-view[data-action-id=' + actionData.actionId + ']',
    ) : $target;

  // Add action to container
  // or replace target
  ($target.length > 0) ?
    $target.replaceWith($actionContainer) :
    $actionContainer.prependTo($actionsList);

  // Handle buttons
  $actionContainer.find('.action-btn').on('click', function(e) {
    const btnAction = $(e.currentTarget).data('action');
    const actionData = $actionContainer.data();

    if (btnAction === 'delete') {
      actionManager.deleteAction(
        actionData,
      ).then((wasRemoved) => {
        if (wasRemoved) {
          // Remove widget from drawer if action has widgetId
          if (actionData.widgetId) {
            app.layout.deleteObject('widget', actionData.widgetId);
          }

          // Remove action line
          app.viewer.removeActionLine($actionContainer.data('actionId'));

          // Remove action container
          $actionContainer.remove();
        }
      });
    } else if (btnAction === 'edit') {
      self.openEditAction(actionData.actionId);
    }
  });

  // Update action line
  if (actionData.actionId) {
    app.viewer.updateActionLineTargets(
      actionData.actionId,
      {
        type: actionData.source,
        id: actionData.sourceId,
      },
      {
        type: (actionData.actionType != 'navLayout') ?
          actionData.target : 'screen',
        id: (actionData.actionType != 'navLayout') ?
          actionData.targetId : actionData.layoutCode,
      },
    );
    app.viewer.updateActionLine();
  }

  // Set actionData to container
  $actionContainer.data(actionData);
};

/**
 * Open action to be edited
 * @param {number} actionId
 * @return {boolean} false if unsuccessful
 */
PropertiesPanel.prototype.openEditAction = function(actionId) {
  const self = this;
  const app = self.parent;

  // Don't open when in read mode
  if (app.readOnlyMode) {
    return;
  }

  const $action = self.DOMObject
    .find('.action-view[data-action-id=' + actionId + ']');
  const $actionsContent = this.DOMObject.find('.actions-content');
  const actionData = $action.data();

  // Add editing status
  app.actionManager.editing = actionData;
  $actionsContent.addClass('editing-action');

  // Create edit action
  self.createEditAction(actionData, $action);
};

/**
 * Close action being edited
 * @param {object} $action
 * @return {boolean} false if unsuccessful
 */
PropertiesPanel.prototype.closeEditAction = function($action) {
  const self = this;
  const app = self.parent;
  const actionData = $action.data();

  // Remove line if temporary action
  if (!actionData.actionId) {
    app.viewer.removeActionLine('action_line_temp');
  }

  // Remove editing status
  app.actionManager.editing = {};

  // Render back actions
  self.renderActions();

  // Update all action lines
  app.viewer.updateActionLine();
};

/**
 * Save action and go to preview
 * @param {object} $actionForm
 * @return {boolean} false if unsuccessful
 */
PropertiesPanel.prototype.saveAction = function($actionForm) {
  const self = this;
  const app = self.parent;
  const actionData = $actionForm.data();

  $actionForm.find('.error-message').hide();

  const showErrorMessage = function(res) {
    // Add message to form
    $actionForm.find('.error-message').html(res.message).show();
  };

  const closeEditAndShowPreview = function() {
    // Remove editing status
    app.actionManager.editing = {};

    self.renderActions();
  };

  if (actionData.actionId) {
    // Save existing action
    app.actionManager.saveAction($actionForm, actionData.actionId)
      .then(
        closeEditAndShowPreview,
        showErrorMessage,
      );
  } else {
    // Add new action
    app.actionManager.addAction($actionForm, app.mainObjectId)
      .then(
        (res) => {
          // Create new action line
          app.viewer.addActionLine(
            {
              type: res.data.source,
              id: res.data.sourceId,
            },
            {
              type: res.data.target,
              id: res.data.targetId,
            },
            res.data.actionId,
          );

          // Close edit form and show preview
          closeEditAndShowPreview(res);
        },
        showErrorMessage,
      );
  }
};

/**
 * Update position form
 * @param {object} properties
 */
PropertiesPanel.prototype.updatePositionForm = function(properties) {
  const app = this.parent;
  const $positionTab =
    this.DOMObject.find('form #positionTab, form.region-form #positionTab');

  // Loop properties
  $.each(properties, function(key, value) {
    // If value is a number, round it
    if (typeof value == 'number') {
      value = Math.round(value);
    }

    // Change value in the form field
    $positionTab.find('[name="' + key + '"]').val(value);
  });

  // Check if we should show the bring to view button
  const notInView = (
    properties.left > app.layout.width ||
    (properties.left + properties.width) < 0 ||
    properties.top > app.layout.height ||
    (properties.top + properties.height) < 0
  );
  $positionTab.find('#bringToView')
    .toggleClass('d-none', !notInView);
};

/**
 * Show widget info
 * @param {object} widget Target widget
 */
PropertiesPanel.prototype.showWidgetInfo = function(widget) {
  const self = this;
  const moduleName = widget.moduleName;

  // Show widget info for statics
  const $widgetInfo = $(templates.forms.widgetInfo({
    widget: widget,
    trans: propertiesPanelTrans.widgetInfo,
  }));

  // Remove margin top from form container
  self.DOMObject.find('.form-container').addClass('mt-0');

  // Disable input
  $widgetInfo.find('input').attr('disabled', 'disabled');

  // Append control
  $widgetInfo.prependTo(
    self.DOMObject.find('.form-container .widget-form'),
  );

  // If name is updated on the form
  // Also update on the widget info
  self.DOMObject.find('.form-control[name="name"]')
    .on('change', function(ev) {
      // If name field is empty, use the module name
      const name = ($(ev.currentTarget).val() != '') ?
        $(ev.currentTarget).val() :
        moduleName;

      // Update info
      $widgetInfo.find('span').html(name);
    });
};

/**
 * Show widget control
 * @param {object} target Target element or group
 */
PropertiesPanel.prototype.showWidgetControl = function(target) {
  const self = this;
  // Get widgets
  const widgetsOfType =
    app.layout.canvas.getWidgetsOfType(target.subType);

  if (Object.values(widgetsOfType).length > 0) {
    // Append control
    self.DOMObject.find('.form-container .widget-form').prepend(
      templates.forms.canvasWidgetsSelector({
        widgetId: target.widgetId,
        widgets: Object.values(widgetsOfType),
        trans: propertiesPanelTrans.canvasWidgetControl,
      }),
    );

    // Canvas control
    const $canvasWidgetSelectorControl =
      self.DOMObject.find('.canvas-widget-control');

    // Get active widget
    const activeWidget = app.layout.canvas.getActiveWidgetOfType(
      target.subType,
      true,
      false,
    );

    // If we had previous active widget, mark is as inactive
    (!$.isEmptyObject(activeWidget)) &&
      (activeWidget.activeTarget = false);

    // Mark widget as active
    widgetsOfType[target.widgetId].activeTarget = true;

    // Remove margin top from form container
    self.DOMObject.find('.form-container').addClass('mt-0');

    // Add and handle add button
    const controlTrans = propertiesPanelTrans.canvasWidgetControl;
    const $addButton =
      $(`<div class="canvas-widget-control-add tooltip-always-on"
        data-toggle="tooltip" 
        data-placement="top"
        title="${controlTrans.transferWidgetHelp}">
        <i class="fa fa-arrow-circle-right"></i>
        <span>
          ${controlTrans.transferWidget}
        </span>
      </div>`);

    // Check if we have other element or group in the widget
    let hasMoreElements = false;
    if (isElement) {
      // We just need to have more than 1 element
      hasMoreElements = (Object.values(target.elements).length > 1);
    } else if (isElementGroup) {
      // We need to have either another group
      hasMoreElements = (Object.values(target.elementGroups).length > 1);

      // Or 1 elements that doesn't belong to the group
      if (hasMoreElements === false) {
        Object.values(target.elements).every((el) => {
          // If we found the widget, break the loop
          if (el.groupId != targetAux.id) {
            hasMoreElements = true;
            // Break the loop
            return false;
          }

          // Keep going
          return true;
        });
      }
    }

    // Only show add button if we have more than 1 element for the widget
    if (hasMoreElements) {
      $addButton.insertAfter(
        $canvasWidgetSelectorControl
          .find('.canvas-widget-control-dropdown .input-info-container'),
      ).on('click', function(_ev) {
        app.addModuleToPlaylist(
          app.layout.canvas.regionId,
          app.layout.canvas.playlists.playlistId,
          target.subType,
          {
            type: targetAux.type,
          },
          null,
          false,
          false,
          false,
          false,
        ).then((res) => {
          const widgetId = res.data.widgetId;
          // Reload data
          app.reloadData(
            app.layout,
            {
              reloadPropertiesPanel: false,
            },
          ).then(() => {
            // Add options to dropdown
            const $select =
              $canvasWidgetSelectorControl.find('select');

            // Get new widget
            const newWidget = app.getObjectByTypeAndId(
              'widget',
              'widget_' + app.layout.canvas.regionId + '_' + widgetId,
              'canvas',
            );

            // Update option
            $select.find('option[selected]').removeAttr('selected');
            $select.append(`<option value="${newWidget.widgetId}" 
              selected>${newWidget.widgetName}</option>`);

            // Trigger change
            $select.trigger('change');
          });
        });
      });
    }

    // Handle change control
    $canvasWidgetSelectorControl
      .on('change', function(ev) {
        const oldWidget =
          app.getObjectByTypeAndId(
            'widget',
            target.getFullId(),
            'canvas',
          );

        const newWidget =
          app.getObjectByTypeAndId(
            'widget',
            $(ev.target).val(),
            'canvas',
          );

        const elementsToMove = (isElementGroup) ?
          Object.values(targetAux.elements) :
          [targetAux];
        const groupsToMove = (isElementGroup) ?
          [targetAux] :
          [];

        // Move elements between widgets in canvas
        app.layout.canvas.moveElementsBetweenWidgets(
          oldWidget.getFullId(),
          newWidget.getFullId(),
          elementsToMove,
          groupsToMove,
        );
      });

    // If name is updated on the form
    // Also update on the widget control
    self.DOMObject.find('.form-control[name="name"]')
      .on('change', function(ev) {
        const $select =
          self.DOMObject.find('.canvas-widget-control select');

        // Update option
        $select.find('option[selected]').html($(ev.currentTarget).val());

        // Reload select2
        makeLocalSelect($select);
      });
  }
};

/**
 * Open custom tab or the previous tab
 * @param {string} tabSelector - jQuery tab selector
 * @param {boolean} save - Save tab to be opened next?
 */
PropertiesPanel.prototype.showTab = function(tabSelector, save = true) {
  const self = this;
  const tabSelectorAux = tabSelector || self.openTabOnRender;
  const $tabToShow = self.DOMObject.find(tabSelectorAux);

  // If tab doesn't exist or it not visible, clear tab
  if (
    $tabToShow.length === 0 ||
    !$tabToShow.is(':visible')
  ) {
    self.openTabOnRender = '';
  } else {
    // Show tab
    $tabToShow.tab('show');

    // Save selector
    (save) && (self.openTabOnRender = tabSelectorAux);
  }
};

/**
 * Save action widget form and continue
 */
PropertiesPanel.prototype.continueEditActionWidget = function() {
  const app = this.parent;

  // Save at least once to prevent adding an invalid widget
  this.save({
    forceSave: true,
    callback: function() {
      app.toggleInteractiveEditWidgetMode(false);
    },
  });
};

/**
 * Cancel action widget edit and go back to interactive mode
 * @param {object} widget - Widget being saved/added
 * @param {boolean} mode - Delete or just cancel?
 */
PropertiesPanel.prototype.cancelEditActionWidget = function(
  widget,
  mode,
) {
  const app = this.parent;
  const self = this;
  const toggleEditActionOff = function() {
    // Toggle mode off
    app.toggleInteractiveEditWidgetMode(
      false,
      null);
  };

  // Check if we're editing or adding widget
  if (
    mode === 'deleteWidget' &&
    widget.type === 'widget'
  ) {
    // Delete widget
    app.layout.deleteObject(
      'widget',
      widget.widgetId,
      false,
      false,
    ).then(() => {
      app.actionManager.editing.widgetId = null;
      toggleEditActionOff();
    });
  } else if (mode === 'revertChanges') {
    // Check if we have serialized form data
    const $form = self.DOMObject.find('form');
    const initFormData = $form.data('initFormState');

    // Revert changes for action widget
    app.historyManager.addChange(
      'saveForm',
      'widget',
      widget.widgetId, // targetId
      '', // oldValues
      initFormData, // newValues
      {
        addToHistory: false,
      },
    ).then(toggleEditActionOff);
  } else {
    // Toggle mode off
    toggleEditActionOff();
  }
};

module.exports = PropertiesPanel;
