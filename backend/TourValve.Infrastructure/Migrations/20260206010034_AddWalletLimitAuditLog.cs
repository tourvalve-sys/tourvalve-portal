using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TourValve.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddWalletLimitAuditLog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<DateTime>(
                name: "CreatedAt",
                table: "WalletHolds",
                type: "timestamp with time zone",
                nullable: false,
                defaultValueSql: "now()",
                oldClrType: typeof(DateTime),
                oldType: "timestamp with time zone");

            migrationBuilder.CreateTable(
                name: "WalletLimitAuditLogs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    WalletAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequesterAgentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Action = table.Column<string>(type: "text", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                    IsAdmin = table.Column<bool>(type: "boolean", nullable: false),
                    AdminBypassEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    AdminBypassUsed = table.Column<bool>(type: "boolean", nullable: false),
                    SingleMax = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                    DailyMax = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                    MonthlyMax = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                    DailyUsed = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                    MonthlyUsed = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                    ActiveHoldsDaily = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                    ActiveHoldsMonthly = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                    Result = table.Column<string>(type: "text", nullable: false),
                    Reason = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WalletLimitAuditLogs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WalletTopUpRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AgentId = table.Column<Guid>(type: "uuid", nullable: false),
                    WalletAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                    ExternalReference = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    RequestedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ReviewedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReviewedByAdminId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WalletTopUpRequests", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WalletLimitAuditLogs_RequesterAgentId_CreatedAt",
                table: "WalletLimitAuditLogs",
                columns: new[] { "RequesterAgentId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_WalletLimitAuditLogs_WalletAccountId_CreatedAt",
                table: "WalletLimitAuditLogs",
                columns: new[] { "WalletAccountId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_WalletTopUpRequests_AgentId_Status",
                table: "WalletTopUpRequests",
                columns: new[] { "AgentId", "Status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WalletLimitAuditLogs");

            migrationBuilder.DropTable(
                name: "WalletTopUpRequests");

            migrationBuilder.AlterColumn<DateTime>(
                name: "CreatedAt",
                table: "WalletHolds",
                type: "timestamp with time zone",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "timestamp with time zone",
                oldDefaultValueSql: "now()");
        }
    }
}
