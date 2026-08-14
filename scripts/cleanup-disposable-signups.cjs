const { PrismaClient, Provider } = require('@prisma/client');

const prisma = new PrismaClient();
const companyName = 'Publishly Release Verification';
const cutoff = new Date(Date.now() - 60 * 60 * 1000);

async function main() {
  const users = await prisma.user.findMany({
    where: {
      email: {
        startsWith: 'release-verification-',
        endsWith: '@example.invalid',
      },
      providerName: Provider.LOCAL,
      createdAt: { gte: cutoff },
    },
    select: {
      id: true,
      organizations: {
        select: {
          organizationId: true,
          organization: { select: { name: true } },
        },
      },
    },
  });

  if (users.length > 5) {
    throw new Error(`Refusing to clean an unexpected ${users.length} users.`);
  }

  const userIds = users.map((user) => user.id);
  const memberships = users.flatMap((user) => user.organizations);
  const unexpectedOrganization = memberships.find(
    (membership) => membership.organization.name !== companyName
  );
  if (unexpectedOrganization) {
    throw new Error('Refusing to clean a user linked to a non-test organization.');
  }
  const organizationIds = [
    ...new Set(memberships.map((membership) => membership.organizationId)),
  ];

  if (userIds.length) {
    await prisma.$transaction(async (transaction) => {
      await transaction.userOrganization.deleteMany({
        where: { userId: { in: userIds } },
      });
      await transaction.organization.deleteMany({
        where: { id: { in: organizationIds }, name: companyName },
      });
      await transaction.user.deleteMany({ where: { id: { in: userIds } } });
    });
  }

  const remaining = await prisma.user.count({
    where: {
      email: {
        startsWith: 'release-verification-',
        endsWith: '@example.invalid',
      },
      createdAt: { gte: cutoff },
    },
  });
  const [totalUsers, totalOrganizations] = await Promise.all([
    prisma.user.count(),
    prisma.organization.count(),
  ]);
  console.log(
    JSON.stringify({
      deletedUsers: userIds.length,
      deletedOrganizations: organizationIds.length,
      remainingDisposableUsers: remaining,
      totalUsers,
      totalOrganizations,
    })
  );
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
