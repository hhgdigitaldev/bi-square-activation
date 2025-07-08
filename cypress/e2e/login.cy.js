describe('Login', function() {

    it('should be able to login the default user', function () {

        cy.visit('/login').then(() => {

            cy.get('input#username')
                .type('hhg_admin');

            cy.get('input#password')
                .type('password');

            cy.get('button[type=submit]')
                .click();

            cy.url().should('include', 'dashboard');

            cy.contains('hhg_admin');
        });
    });

    it('should fail to login an invalid user', function () {

        cy.visit('/login').then(() => {
            cy.get('input#username')
                .type('hhg_admin');

            cy.get('input#password')
                .type('wrongpassword');

            cy.get('button[type=submit]')
                .click();

            cy.contains('Username or Password incorrect');
        });
    });

    it('successfully loads', () => {
        cy.visit('/login');
        cy.get('input[name="username"]')
            .type('hhglobal');
        cy.get('input[name="password"]')
            .type('password');
        cy.get('button[type="submit"]').click();
        cy.url().should('include', '/');
        cy.contains('hhglobal');
    });

    it('shows an error for a bad password', () => {
        cy.visit('/login');
        cy.get('input[name="username"]')
            .type('hhglobal');
        cy.get('input[name="password"]')
            .type('bad');
        cy.get('button[type="submit"]').click();
        cy.contains('Username or Password incorrect');
    });
});