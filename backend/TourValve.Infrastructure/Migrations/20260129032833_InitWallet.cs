using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TourValve.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitWallet : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WalletAccounts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AgentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Currency = table.Column<string>(type: "text", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WalletAccounts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WalletHolds",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WalletAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    Reference = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WalletHolds", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WalletLedger",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WalletAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "text", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                    Reference = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WalletLedger", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WalletHolds_WalletAccountId_Status",
                table: "WalletHolds",
                columns: new[] { "WalletAccountId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_WalletLedger_WalletAccountId",
                table: "WalletLedger",
                column: "WalletAccountId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WalletAccounts");

            migrationBuilder.DropTable(
                name: "WalletHolds");

            migrationBuilder.DropTable(
                name: "WalletLedger");
        }
    }
}
